import { Router, type IRouter, type Request } from "express";
import { and, eq } from "drizzle-orm";
import { db, hbgUsers } from "@workspace/db";
import {
  bootstrapCredential,
  canStartDevelopmentSession,
  clearAuthCookies,
  createDevelopmentSession,
  createSession,
  hashSecret,
  isSafeUsername,
  rejectClientAuthorityFields,
  requireAuth,
  revokeDevelopmentSession,
  revokeSession,
  secretsEqual,
  setDevelopmentCookie,
  setSessionCookie,
} from "../lib/hbgAuth";
import { recordAudit } from "../lib/audit";
import type { HBGUser } from "@workspace/db";

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

export type LoginCredentialStatus =
  | "invalid"
  | "stored"
  | "owner-bootstrap"
  | "owner-reactivation"
  | "owner-record-missing";

export function classifyLoginCredential(
  username: string,
  user: HBGUser | undefined,
  credential: string,
  bootstrap: string | undefined,
): LoginCredentialStatus {
  const validBootstrap =
    username === "owner" &&
    Boolean(bootstrap) &&
    secretsEqual(credential, bootstrap ?? "");

  if (username === "owner") {
    if (!user) return validBootstrap ? "owner-record-missing" : "invalid";
    if (user.role !== "owner") return "invalid";
    if (validBootstrap) {
      return user.active ? "owner-bootstrap" : "owner-reactivation";
    }
  }

  if (user?.role === "system" || !user?.active || !user.credentialHash) {
    return "invalid";
  }
  return secretsEqual(hashSecret(credential), user.credentialHash)
    ? "stored"
    : "invalid";
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
      .where(eq(hbgUsers.username, username))
      .limit(1);
    const user = users[0];
    const bootstrap = bootstrapCredential();
    const credentialStatus = classifyLoginCredential(
      username,
      user,
      credential,
      bootstrap,
    );
    if (credentialStatus === "invalid") {
      registerLoginFailure(attemptKey, now);
      await recordAudit({
        actorUserId: user?.id,
        action: "auth.login",
        resource: "hbg-auth",
        result: "failure",
        errorCode:
          username === "owner" && user && user.role !== "owner"
            ? "OWNER_ROLE_MISMATCH"
            : "INVALID_CREDENTIALS",
        metadata: { username },
      });
      res.status(401).json({
        success: false,
        error: "Identidad o credencial no válidas.",
        code: "INVALID_CREDENTIALS",
      });
      return;
    }

    if (credentialStatus === "owner-record-missing" || !user) {
      await recordAudit({
        action: "auth.login",
        resource: "hbg-auth",
        result: "failure",
        errorCode: "OWNER_ACCOUNT_MISSING",
        metadata: { username },
      });
      res.status(503).json({
        success: false,
        error: "La identidad OWNER existente no está disponible.",
        code: "OWNER_ACCOUNT_UNAVAILABLE",
      });
      return;
    }

    // La actualización del estado, su auditoría y la sesión son atómicas.
    // Solo la credencial bootstrap válida puede reactivar el registro OWNER existente.
    const { owner, token } = await db.transaction(async (tx) => {
      const [currentUser] = await tx
        .select()
        .from(hbgUsers)
        .where(eq(hbgUsers.id, user.id))
        .for("update")
        .limit(1);
      if (!currentUser) throw new Error("La identidad autenticada dejó de existir.");

      const currentStatus = classifyLoginCredential(
        username,
        currentUser,
        credential,
        bootstrap,
      );
      if (
        currentStatus === "invalid" ||
        currentStatus === "owner-record-missing"
      ) {
        throw new Error("La identidad cambió durante la autenticación.");
      }

      let owner = currentUser;
      if (!currentUser.active) {
        if (
          currentStatus !== "owner-reactivation" ||
          currentUser.role !== "owner"
        ) {
          throw new Error("La cuenta inactiva no puede iniciar sesión.");
        }
        const [reactivated] = await tx
          .update(hbgUsers)
          .set({ active: true, updatedAt: new Date() })
          .where(
            and(
              eq(hbgUsers.id, currentUser.id),
              eq(hbgUsers.role, "owner"),
              eq(hbgUsers.active, false),
            ),
          )
          .returning();
        if (!reactivated) throw new Error("No se pudo reactivar la identidad OWNER.");
        owner = reactivated;
        await recordAudit(
          {
            actorUserId: owner.id,
            action: "auth.owner.reactivated",
            resource: "hbg-auth",
            result: "success",
            metadata: { username: owner.username, reason: "valid_bootstrap_credential" },
          },
          tx,
        );
      }

      await recordAudit(
        {
          actorUserId: owner.id,
          action: "auth.login",
          resource: "hbg-auth",
          result: "success",
          metadata: { username: owner.username },
        },
        tx,
      );
      const token = await createSession(owner.id, tx);
      return { owner, token };
    });

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

router.post("/auth/development/start", requireAuth, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const forbiddenField = rejectClientAuthorityFields(body);
  if (forbiddenField) {
    res.status(400).json({ success: false, error: forbiddenField, code: "FORBIDDEN_FIELD" });
    return;
  }
  const purpose = typeof body.purpose === "string" ? body.purpose.trim() : "";
  if (!purpose || purpose.length > 160) {
    res.status(400).json({
      success: false,
      error: "El propósito debe tener entre 1 y 160 caracteres.",
      code: "INVALID_PURPOSE",
    });
    return;
  }
  if (!canStartDevelopmentSession(req.hbgAuth!.user)) {
    res.status(403).json({
      success: false,
      error: "Solo el OWNER puede iniciar una sesión de desarrollo.",
      code: "FORBIDDEN",
    });
    return;
  }

  let token: string | undefined;
  try {
    const developmentSession = await createDevelopmentSession(
      req.hbgAuth!.user.id,
      purpose,
    );
    token = developmentSession.token;
    await recordAudit({
      actorUserId: req.hbgAuth!.user.id,
      action: "development.start",
      resource: "hbg-auth",
      result: "success",
      metadata: {
        purpose,
        expiresAt: developmentSession.expiresAt.toISOString(),
      },
    });
    setDevelopmentCookie(res, developmentSession.token);
    res.json({
      success: true,
      expiresAt: developmentSession.expiresAt.toISOString(),
    });
  } catch (error) {
    if (token) {
      try {
        await revokeDevelopmentSession(token);
      } catch (revokeError) {
        req.log.error({ err: revokeError }, "Unable to revoke unaudited development session");
      }
    }
    req.log.error({ err: error }, "Development session start failed");
    res.status(503).json({
      success: false,
      error: "No se pudo iniciar una sesión de desarrollo segura.",
      code: "DEVELOPMENT_SESSION_UNAVAILABLE",
    });
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