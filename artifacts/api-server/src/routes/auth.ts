import { Router, type IRouter } from "express";
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