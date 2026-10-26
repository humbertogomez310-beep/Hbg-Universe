import { Router, type IRouter, type Request } from "express";
import { and, eq } from "drizzle-orm";
import { db, hbgUsers } from "@workspace/db";
import {
  bootstrapCredential,
  clearAuthCookies,
  createSession,
  hashSecret,
  isSafeUsername,
  rejectClientAuthorityFields,
  requireAuth,
  revokeDevelopmentSession,
  revokeSession,
  secretsEqual,
  setSessionCookie,
} from "../lib/hbgAuth";
import { recordAudit } from "../lib/audit";

const router: IRouter = Router();

// Límite de intentos fallidos de login: 5 por visitante (IP) cada 15 minutos.
// Vive en memoria: se reinicia si el servidor se reinicia.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const loginFailures = new Map<string, { count: number; resetAt: number }>();

function loginKey(req: Request): string {
  return req.ip ?? "desconocido";
}

function pruneLoginFailures(now: number): void {
  for (const [key, entry] of loginFailures) {
    if (entry.resetAt <= now) loginFailures.delete(key);
  }
}

function isLoginBlocked(key: string, now: number): boolean {
  const entry = loginFailures.get(key);
  return Boolean(entry && entry.resetAt > now && entry.count >= LOGIN_MAX_FAILURES);
}

function registerLoginFailure(key: string, now: number): void {
  const entry = loginFailures.get(key);
  if (!entry || entry.resetAt <= now) {
    loginFailures.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

router.get("/auth/me", (req, res) => {
  if (!req.hbgAuth) {
    res.json({ authenticated: false, user: null, isDevelopment: false });
    return;
  }
  res.json({
    authenticated: true,
    user: {
      id: req.hbgAuth.user.id,
      username: req.hbgAuth.user.username,
      role: req.hbgAuth.role,
    },
    permissions: [...req.hbgAuth.permissions],
    isDevelopment: req.hbgAuth.isDevelopment,
    developmentSessionExpiresAt:
      req.hbgAuth.developmentSessionExpiresAt?.toISOString() ?? null,
  });
});

router.post("/auth/login", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const invalidAuthorityField = rejectClientAuthorityFields(body);
  if (invalidAuthorityField) {
    res.status(400).json({ success: false, error: invalidAuthorityField });
    return;
  }
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const credential =
    typeof body.credential === "string" ? body.credential : "";
  if (!username || !credential || !isSafeUsername(username)) {
    res.status(400).json({
      success: false,
      error: "Se requiere una identidad y una credencial válidas.",
    });
    return;
  }

  const attemptKey = loginKey(req);
  const now = Date.now();
  pruneLoginFailures(now);
  if (isLoginBlocked(attemptKey, now)) {
    try {
      await recordAudit({
        action: "auth.login",
        resource: "hbg-auth",
        result: "failure",
        errorCode: "TOO_MANY_ATTEMPTS",
        metadata: { username },
      });
    } catch (error) {
      req.log.error({ err: error }, "Audit write failed for blocked login");
    }
    const blockedEntry = loginFailures.get(attemptKey);
    const retryAfter = Math.max(1, Math.ceil(((blockedEntry?.resetAt ?? now) - now) / 1000));
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({
      success: false,
      error: "Demasiados intentos. Espera unos minutos.",
      code: "TOO_MANY_ATTEMPTS",
    });
    return;
  }

  try {
    const users = await db
      .select()
      .from(hbgUsers)
      .where(and(eq(hbgUsers.username, username), eq(hbgUsers.active, true)))
      .limit(1);
    const user = users[0];
    const bootstrap = bootstrapCredential();
    const validBootstrap =
      username === "owner" && Boolean(bootstrap) && secretsEqual(credential, bootstrap!);
    const validStored =
      Boolean(user?.credentialHash) &&
      secretsEqual(hashSecret(credential), user?.credentialHash ?? "");
    // La clave de dueño nunca asciende ni reutiliza una identidad "owner" con otro rol.
    const ownerRoleMismatch =
      validBootstrap && Boolean(user) && user!.role !== "owner";
    if (
      (!validBootstrap && !validStored) ||
      ownerRoleMismatch ||
      (user && user.role === "system")
    ) {
      registerLoginFailure(attemptKey, now);
      await recordAudit({
        actorUserId: user?.id,
        action: "auth.login",
        resource: "hbg-auth",
        result: "failure",
        errorCode: ownerRoleMismatch ? "OWNER_ROLE_MISMATCH" : "INVALID_CREDENTIALS",
        metadata: { username },
      });
      res.status(401).json({
        success: false,
        error: "Identidad o credencial no válidas.",
        code: "INVALID_CREDENTIALS",
      });
      return;
    }

    const owner =
      user ??
      (
        await db
          .insert(hbgUsers)
          .values({ username: "owner", role: "owner" })
          .returning()
      )[0];
    if (!owner) throw new Error("No se pudo crear la identidad owner.");
    // Si la auditoría no se puede escribir, no se abre sesión (falla cerrado).
    await recordAudit({
      actorUserId: owner.id,
      action: "auth.login",
      resource: "hbg-auth",
      result: "success",
      metadata: { username: owner.username },
    });
    const token = await createSession(owner.id);
    setSessionCookie(res, token);
    loginFailures.delete(attemptKey);
    res.json({
      success: true,
      user: { id: owner.id, username: owner.username, role: owner.role },
    });
  } catch (error) {
    req.log.error({ err: error }, "HBG auth login failed");
    res.status(503).json({
      success: false,
      error: "El servicio de autenticación no está disponible.",
      code: "AUTH_UNAVAILABLE",
    });
  }
});

router.post("/auth/logout", async (req, res) => {
  try {
    await revokeSession(req.cookies?.hbg_session);
    await revokeDevelopmentSession(req.cookies?.hbg_development_session);
    if (req.hbgAuth) {
      await recordAudit({
        actorUserId: req.hbgAuth.user.id,
        action: "auth.logout",
        resource: "hbg-auth",
        result: "success",
      });
    }
    clearAuthCookies(res);
    res.json({ success: true });
  } catch (error) {
    req.log.error({ err: error }, "HBG auth logout failed");
    res.status(503).json({ success: false, error: "No se pudo cerrar la sesión." });
  }
});

router.post("/auth/development/end", requireAuth, async (req, res) => {
  try {
    await revokeDevelopmentSession(req.cookies?.hbg_development_session);
    await recordAudit({
      actorUserId: req.hbgAuth!.user.id,
      action: "development.end",
      resource: "hbg-auth",
      result: "success",
    });
    clearAuthCookies(res);
    const token = await createSession(req.hbgAuth!.user.id);
    setSessionCookie(res, token);
    res.json({ success: true });
  } catch (error) {
    req.log.error({ err: error }, "Development session end failed");
    res.status(503).json({ success: false, error: "No se pudo cerrar desarrollo." });
  }
});

export default router;