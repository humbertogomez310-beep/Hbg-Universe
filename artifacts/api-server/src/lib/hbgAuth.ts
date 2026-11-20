import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Logger } from "pino";
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
  | "terminador.manage"
  | "terminador.develop"
  | "universe.code.inspect"
  | "universe.code.modify"
  | "authority.core.modify"
  | "universe.command.execute"
  | "universe.audit.read"
  | "universe.registry.read";

export interface HBGAuthContext {
  user: HBGUser;
  role: HBGRole;
  permissions: ReadonlySet<HBGPermission>;
  isDevelopment: boolean;
  sessionTokenHash: string;
  sessionExpiresAt: Date;
  developmentSessionTokenHash?: string;
  developmentSessionExpiresAt?: Date;
}

declare global {
  namespace Express {
    interface Request {
      hbgAuth?: HBGAuthContext;
      log: Logger;
    }
  }
}

const SESSION_COOKIE = "hbg_session";
const DEVELOPMENT_COOKIE = "hbg_development_session";
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DEVELOPMENT_MAX_AGE_MS = 60 * 60 * 1000;

const ROLE_PERMISSIONS: Record<HBGRole, readonly HBGPermission[]> = {
  owner: [
    "universe.read",
    "core.action.execute",
    "terminador.use",
    "terminador.manage",
    "universe.code.inspect",
    "universe.audit.read",
    "universe.registry.read",
  ],

  user: ["universe.read", "core.action.execute"],
  system: ["universe.read", "core.action.execute"],
};

function immutableSet<T>(values: Iterable<T>): ReadonlySet<T> {
  const set = new Set(values);
  let view: ReadonlySet<T>;
  view = {
    get size() {
      return set.size;
    },
    has: (value) => set.has(value),
    entries: () => set.entries(),
    keys: () => set.keys(),
    values: () => set.values(),
    forEach: (callback, thisArg) =>
      set.forEach((value) => callback.call(thisArg, value, value, view)),
    [Symbol.iterator]: () => set[Symbol.iterator](),
  };
  return Object.freeze(view);
}

function roleOf(user: HBGUser): HBGRole | null {
  return user.role === "owner" || user.role === "user" || user.role === "system"
    ? user.role
    : null;
}

export function permissionsFor(user: HBGUser): ReadonlySet<HBGPermission> {
  const role = roleOf(user);
  return immutableSet(role ? ROLE_PERMISSIONS[role] : []);
}

export function hasPermission(
  context: HBGAuthContext,
  permission: HBGPermission,
): boolean {
  return context.permissions.has(permission);
}

export function canStartDevelopmentSession(user: HBGUser): boolean {
  return roleOf(user) === "owner";
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

export async function createSession(
  userId: string,
  writer: Pick<typeof db, "insert"> = db,
): Promise<string> {
  const token = createOpaqueToken();
  await writer.insert(hbgSessions).values({
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

  const developmentToken = req.cookies?.[DEVELOPMENT_COOKIE] as string | undefined;
  let developmentSessionTokenHash: string | undefined;
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
      developmentSessionTokenHash = hashSecret(developmentToken!);
      developmentSessionExpiresAt = developmentSession.expiresAt;
    }
  }

  return {
    user: row.user,
    role,
    permissions: permissionsFor(row.user),
    isDevelopment,
    sessionTokenHash: hashSecret(sessionToken),
    sessionExpiresAt: row.session.expiresAt,
    developmentSessionTokenHash,
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
  if (req.hbgAuth.role !== "owner") {
    forbidden(res, "Solo el propietario puede operar en modo desarrollo.");
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
    if (req.hbgAuth.role !== "owner") {
      forbidden(res, "Solo el propietario puede operar en modo desarrollo.");
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
  const credential = process.env.HBG_OWNER_SECRET ?? process.env.HBG_OWNER_TOKEN;
  return credential && credential.length >= 16 ? credential : undefined;
}

export function isSafeUsername(value: string): boolean {
  return /^[a-zA-Z0-9_.-]{3,64}$/.test(value);
}

const CLIENT_AUTHORITY_FIELDS = new Set(
  [
    "owner",
    "role",
    "roles",
    "permission",
    "permissions",
    "isOwner",
    "isSystem",
    "isDevelopment",
    "authorized",
    "approved",
    "hbgAuth",
    "tokenHash",
    "credentialHash",
    "developmentSession",
    "developmentSessionExpiresAt",
    "authority",
    "accessControl",
    "permissionSet",
    "session",
    "cookie",
  ].map((field) => field.toLowerCase().replace(/[^a-z0-9]/g, "")),
);

function findClientAuthorityField(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): string | undefined {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return undefined;
  }
  seen.add(value);
  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value);
  for (const [key, nestedValue] of entries) {
    if (
      CLIENT_AUTHORITY_FIELDS.has(
        key.toLowerCase().replace(/[^a-z0-9]/g, ""),
      )
    ) {
      return key;
    }
    const nested = findClientAuthorityField(nestedValue, seen);
    if (nested) return nested;
  }
  return undefined;
}

export function rejectClientAuthorityFields(
  body: Record<string, unknown>,
): string | undefined {
  const found = findClientAuthorityField(body);
  return found ? `El campo "${found}" no es controlable por el cliente.` : undefined;
}

export function isProtectedAuthorityMutation(body: Record<string, unknown>): boolean {
  return findClientAuthorityField(body) !== undefined;
}
