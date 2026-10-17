import { Router, type IRouter, type Request, type Response } from "express";
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
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;

interface LoginFailureState {
  failures: number;
  inFlight: number;
  windowStartedAt: number;
}

const loginFailuresByIp = new Map<string, LoginFailureState>();

function clearExpiredLoginFailures(now: number): void {
  for (const [ip, state] of loginFailuresByIp) {
    if (now - state.windowStartedAt >= LOGIN_FAILURE_WINDOW_MS) {
      if (state.inFlight === 0) {
        loginFailuresByIp.delete(ip);
      } else {
        state.failures = 0;
        state.windowStartedAt = now;
      }
    }
  }
}

function reserveLoginAttempt(
  ip: string,
  now: number,
): LoginFailureState | undefined {
  clearExpiredLoginFailures(now);
  const existing = loginFailuresByIp.get(ip);
  const state =
    existing && now - existing.windowStartedAt < LOGIN_FAILURE_WINDOW_MS
      ? existing
      : { failures: 0, inFlight: 0, windowStartedAt: now };
  if (state.failures + state.inFlight >= MAX_LOGIN_FAILURES) return undefined;
  state.inFlight += 1;
  loginFailuresByIp.set(ip, state);
  return state;
}

function completeLoginAttempt(
  ip: string,
  state: LoginFailureState,
  outcome: "failure" | "success" | "aborted",
): void {
  state.inFlight = Math.max(0, state.inFlight - 1);
  if (outcome === "failure") state.failures += 1;
  if (outcome === "success") state.failures = 0;
  if (state.inFlight === 0 && state.failures === 0) {
    loginFailuresByIp.delete(ip);
  } else {
    loginFailuresByIp.set(ip, state);
  }
}

async function respondLoginRateLimited(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    await recordAudit({
      action: "auth.login",
      resource: "hbg-auth",
      result: "failure",
      errorCode: "TOO_MANY_ATTEMPTS",
    });
  } catch (error) {
    req.log.error({ err: error }, "Unable to audit blocked HBG login attempt");
  }
  res.status(429).json({
    success: false,
    error: "Demasiados intentos. Espera unos minutos.",
    code: "TOO_MANY_ATTEMPTS",
  });
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
  const loginIp = req.ip || "unknown";
  const now = Date.now();
  clearExpiredLoginFailures(now);
  const currentAttempts = loginFailuresByIp.get(loginIp);
  if (
    currentAttempts &&
    currentAttempts.failures + currentAttempts.inFlight >= MAX_LOGIN_FAILURES
  ) {
    await respondLoginRateLimited(req, res);
    return;
  }

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

  const reservedAttempt = reserveLoginAttempt(loginIp, Date.now());
  if (!reservedAttempt) {
    await respondLoginRateLimited(req, res);
    return;
  }
  let attemptReserved = true;

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
    if ((!validBootstrap && !validStored) || (user && user.role === "system")) {
      completeLoginAttempt(loginIp, reservedAttempt, "failure");
      attemptReserved = false;
      await recordAudit({
        actorUserId: user?.id,
        action: "auth.login",
        resource: "hbg-auth",
        result: "failure",
        errorCode: "INVALID_CREDENTIALS",
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
    const token = await createSession(owner.id);
    setSessionCookie(res, token);
    await recordAudit({
      actorUserId: owner.id,
      action: "auth.login",
      resource: "hbg-auth",
      result: "success",
      metadata: { username: owner.username },
    });
    completeLoginAttempt(loginIp, reservedAttempt, "success");
    attemptReserved = false;
    res.json({
      success: true,
      user: { id: owner.id, username: owner.username, role: owner.role },
    });
  } catch (error) {
    if (attemptReserved) {
      completeLoginAttempt(loginIp, reservedAttempt, "aborted");
    }
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