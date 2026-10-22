import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import {
  db,
  hbgDevelopmentSessions,
  hbgSessions,
  hbgUsers,
  type HBGUser,
} from "@workspace/db";

export type HBGRole = "owner" | "user" | "system";
export type HBGPermission =
  | "universe.read"
  | "core.action.execute"
  | "terminador.use"
  | "terminador.develop"
  | "universe.code.inspect"
  | "universe.code.modify"
  | "universe.command.execute"
  | "universe.audit.read"
  | "universe.registry.read";

export interface HBGAuthContext {
  user: HBGUser;
  role: HBGRole;
  permissions: ReadonlySet<HBGPermission>;
  isDevelopment: boolean;
  developmentSessionExpiresAt?: Date;
}

declare global {
  namespace Express {
    interface Request {
      hbgAuth?: HBGAuthContext;
    }
  }
}

const SESSION_COOKIE = "hbg_session";
const DEVELOPMENT_COOKIE = "hbg_development_session";
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DEVELOPMENT_MAX_AGE_MS = 60 * 60 * 1000;

const ROLE_PERMISSIONS: Record<HBGRole, ReadonlySet<HBGPermission>> = {
  owner: new Set([
    "universe.read",
    "core.action.execute",
    "terminador.use",
    "universe.audit.read",
    "universe.registry.read",
  ]),
  user: new Set(["universe.read", "core.action.execute", "terminador.use"]),
  system: new Set(["universe.read", "core.action.execute"]),
};

function roleOf(user: HBGUser): HBGRole | null {
  return user.role === "owner" || user.role === "user" || user.role === "system"
    ? user.role
    : null;
}

export function permissionsFor(user: HBGUser): ReadonlySet<HBGPermission> {
  const role = roleOf(user);
  return role ? ROLE_PERMISSIONS[role] : new Set();
}

export function hasPermission(
  context: HBGAuthContext,
  permission: HBGPermission,
): boolean {
  return context.permissions.has(permission);
}

export function hashSecret(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function secretsEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge,
    path: "/",
  };
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, cookieOptions(SESSION_MAX_AGE_MS));
}

export function setDevelopmentCookie(res: Response, token: string): void {
  res.cookie(
    DEVELOPMENT_COOKIE,
    token,
    cookieOptions(DEVELOPMENT_MAX_AGE_MS),
  );
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, path: "/" });
  res.clearCookie(DEVELOPMENT_COOKIE, { httpOnly: true, path: "/" });
}

export async function createSession(userId: string): Promise<string> {
  const token = createOpaqueToken();
  await db.insert(hbgSessions).values({
    tokenHash: hashSecret(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS),
  });
  return token;
}

export async function createDevelopmentSession(
  userId: string,
  purpose: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + DEVELOPMENT_MAX_AGE_MS);
  await db.insert(hbgDevelopmentSessions).values({
    tokenHash: hashSecret(token),
    userId,
    purpose,
    expiresAt,
  });
  return { token, expiresAt };
}

export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db
    .delete(hbgSessions)
    .where(eq(hbgSessions.tokenHash, hashSecret(token)));
}

export async function revokeDevelopmentSession(
  token: string | undefined,
): Promise<void> {
  if (!token) return;
  await db
    .update(hbgDevelopmentSessions)
    .set({ endedAt: new Date() })
    .where(
      and(
        eq(hbgDevelopmentSessions.tokenHash, hashSecret(token)),
        isNull(hbgDevelopmentSessions.endedAt),
      ),
    );
}

async function loadContext(req: Request): Promise<HBGAuthContext | undefined> {
  const sessionToken = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!sessionToken) return undefined;

  const sessionRows = await db
    .select({ session: hbgSessions, user: hbgUsers })
    .from(hbgSessions)
    .innerJoin(hbgUsers, eq(hbgSessions.userId, hbgUsers.id))
    .where(
      and(
        eq(hbgSessions.tokenHash, hashSecret(sessionToken)),
        gt(hbgSessions.expiresAt, new Date()),
        eq(hbgUsers.active, true),
      ),
    )
    .limit(1);
  const row = sessionRows[0];
  if (!row) return undefined;

  const role = roleOf(row.user);
  if (!role) return undefined;

  const developmentToken = req.cookies?.[
    DEVELOPMENT_COOKIE
  ] as string | undefined;
  let developmentSessionExpiresAt: Date | undefined;
  let isDevelopment = false;
  if (developmentToken) {
    const developmentRows = await db
      .select({ session: hbgDevelopmentSessions })
      .from(hbgDevelopmentSessions)
      .where(
        and(
          eq(hbgDevelopmentSessions.tokenHash, hashSecret(developmentToken)),
          eq(hbgDevelopmentSessions.userId, row.user.id),
          gt(hbgDevelopmentSessions.expiresAt, new Date()),
          isNull(hbgDevelopmentSessions.endedAt),
        ),
      )
      .limit(1);
    const developmentSession = developmentRows[0]?.session;
    if (developmentSession) {
      isDevelopment = true;
      developmentSessionExpiresAt = developmentSession.expiresAt;
    }
  }

  return {
    user: row.user,
    role,
    permissions: permissionsFor(row.user),
    isDevelopment,
    developmentSessionExpiresAt,
  };
}

export const authMiddleware: RequestHandler = async (req, _res, next) => {
  try {
    req.hbgAuth = await loadContext(req);
    next();
  } catch (error) {
    req.log.error({ err: error }, "Unable to load HBG auth context");
    next();
  }
};

function unauthorized(res: Response, message = "Autenticación requerida."): void {
  res.status(401).json({ success: false, error: message, code: "AUTH_REQUIRED" });
}

function forbidden(res: Response, message = "Permiso insuficiente."): void {
  res.status(403).json({ success: false, error: message, code: "FORBIDDEN" });
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.hbgAuth) {
    unauthorized(res);
    return;
  }
  next();
};

export function requirePermission(permission: HBGPermission): RequestHandler {
  return (req, res, next) => {
    if (!req.hbgAuth) {
      unauthorized(res);
      return;
    }
    if (!hasPermission(req.hbgAuth, permission)) {
      forbidden(res);
      return;
    }
    next();
  };
}

export const requireDevelopment: RequestHandler = (req, res, next) => {
  if (!req.hbgAuth) {
    unauthorized(res);
    return;
  }
  if (!req.hbgAuth.isDevelopment) {
    forbidden(res, "Se requiere una sesión de desarrollo activa.");
    return;
  }
  next();
};

export function requireDevelopmentPermission(
  permission: HBGPermission,
): RequestHandler {
  return (req, res, next) => {
    if (!req.hbgAuth) {
      unauthorized(res);
      return;
    }
    if (!req.hbgAuth.isDevelopment) {
      forbidden(res, "Se requiere una sesión de desarrollo activa.");
      return;
    }
    if (!hasPermission(req.hbgAuth, permission)) {
      forbidden(res);
      return;
    }
    next();
  };
}

export function bootstrapCredential(): string | undefined {
  return process.env.HBG_OWNER_TOKEN;
}

export function isSafeUsername(value: string): boolean {
  return /^[a-zA-Z0-9_.-]{3,64}$/.test(value);
}

export function rejectClientAuthorityFields(
  body: Record<string, unknown>,
): string | undefined {
  const forbiddenFields = [
    "role",
    "permissions",
    "isOwner",
    "isSystem",
    "isDevelopment",
    "authorized",
    "approved",
  ];
  const found = forbiddenFields.find((field) => field in body);
  return found ? `El campo "${found}" no es controlable por el cliente.` : undefined;
}