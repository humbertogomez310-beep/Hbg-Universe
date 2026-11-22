
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import {
  db,
  hbgDevelopmentSessions,
  hbgPermissionGrants,
  hbgSessions,
  hbgUsers,
} from "@workspace/db";
import { hasPermission, type HBGAuthContext } from "./hbgAuth";
import { recordAudit } from "./audit";

const REQUIRED_PERMISSION = "universe.code.modify";
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_TTL_MS = 15 * 60 * 1000;

export class PermissionGrantError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "PermissionGrantError";
  }
}

export interface CreatePermissionGrantInput {
  permission: "universe.code.modify";
  resourcePath: string;
  reason: string;
  ttlMs?: number;
}

export interface PermissionGrantView {
  id: string;
  permission: string;
  resourcePath: string;
  reason: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

function normalizeResourcePath(value: string): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 500 ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("\\") ||
    value.includes("//") ||
    value.includes("*") ||
    value.includes("?") ||
    value.includes("%") ||
    value.includes("\0")
  ) {
    throw new PermissionGrantError(
      "La ruta del recurso no es válida.",
      400,
      "INVALID_RESOURCE_PATH",
    );
  }

  const segments = value.split("/");

  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        !/^[a-zA-Z0-9_.@-]+$/.test(segment),
    )
  ) {
    throw new PermissionGrantError(
      "La ruta contiene segmentos no permitidos.",
      400,
      "INVALID_RESOURCE_PATH",
    );
  }

  return segments.join("/");
}

function viewOf(
  row: typeof hbgPermissionGrants.$inferSelect,
): PermissionGrantView {
  return {
    id: row.id,
    permission: row.permission,
    resourcePath: row.resourcePath,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

function requireOwnerDevelopment(
  context: HBGAuthContext,
): {
  sessionTokenHash: string;
  developmentSessionTokenHash: string;
} {
  if (context.role !== "owner") {
    throw new PermissionGrantError(
      "Solo el OWNER puede administrar permisos críticos.",
      403,
      "OWNER_REQUIRED",
    );
  }

  if (!hasPermission(context, "terminador.manage")) {
    throw new PermissionGrantError(
      "El OWNER no dispone del permiso de administración requerido.",
      403,
      "FORBIDDEN",
    );
  }

  if (
    !context.isDevelopment ||
    !context.sessionTokenHash ||
    !context.developmentSessionTokenHash
  ) {
    throw new PermissionGrantError(
      "Se requiere una sesión autenticada del OWNER y una sesión de desarrollo.",
      403,
      "DEVELOPMENT_SESSION_REQUIRED",
    );
  }

  return {
    sessionTokenHash: context.sessionTokenHash,
    developmentSessionTokenHash:
      context.developmentSessionTokenHash,
  };
}

async function assertLiveOwner(
  context: HBGAuthContext,
): Promise<{
  sessionTokenHash: string;
  developmentSessionTokenHash: string;
}> {
  const binding = requireOwnerDevelopment(context);
  const now = new Date();

  const [session] = await db
    .select({ tokenHash: hbgSessions.tokenHash })
    .from(hbgSessions)
    .innerJoin(hbgUsers, eq(hbgUsers.id, hbgSessions.userId))
    .where(
      and(
        eq(hbgSessions.tokenHash, binding.sessionTokenHash),
        eq(hbgSessions.userId, context.user.id),
        gt(hbgSessions.expiresAt, now),
        eq(hbgUsers.active, true),
        eq(hbgUsers.role, "owner"),
      ),
    )
    .limit(1);

  const [developmentSession] = await db
    .select({
      tokenHash: hbgDevelopmentSessions.tokenHash,
    })
    .from(hbgDevelopmentSessions)
    .where(
      and(
        eq(
          hbgDevelopmentSessions.tokenHash,
          binding.developmentSessionTokenHash,
        ),
        eq(hbgDevelopmentSessions.userId, context.user.id),
        gt(hbgDevelopmentSessions.expiresAt, now),
        isNull(hbgDevelopmentSessions.endedAt),
      ),
    )
    .limit(1);

  if (!session || !developmentSession) {
    throw new PermissionGrantError(
      "La sesión del OWNER o la sesión de desarrollo expiró o fue revocada.",
      401,
      "SESSION_INVALID",
    );
  }

  return binding;
}

export async function createPermissionGrant(
  context: HBGAuthContext,
  input: CreatePermissionGrantInput,
): Promise<PermissionGrantView> {
  const binding = await assertLiveOwner(context);

  if (input.permission !== REQUIRED_PERMISSION) {
    throw new PermissionGrantError(
      "Este servicio solo puede conceder universe.code.modify.",
      403,
      "PERMISSION_NOT_ALLOWED",
    );
  }

  const resourcePath = normalizeResourcePath(input.resourcePath);

  if (
    typeof input.reason !== "string" ||
    input.reason.trim().length < 5 ||
    input.reason.trim().length > 500
  ) {
    throw new PermissionGrantError(
      "La justificación debe tener entre 5 y 500 caracteres.",
      400,
      "INVALID_REASON",
    );
  }

  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;

  if (
    !Number.isSafeInteger(ttlMs) ||
    ttlMs < 1000 ||
    ttlMs > MAX_TTL_MS
  ) {
    throw new PermissionGrantError(
      "La duración debe estar entre 1 segundo y 15 minutos.",
      400,
      "INVALID_TTL",
    );
  }

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + ttlMs);

  const created = await db.transaction(async (tx) => {
    const now = new Date();

    const [liveSession] = await tx
      .select({ tokenHash: hbgSessions.tokenHash })
      .from(hbgSessions)
      .innerJoin(hbgUsers, eq(hbgUsers.id, hbgSessions.userId))
      .where(
        and(
          eq(hbgSessions.tokenHash, binding.sessionTokenHash),
          eq(hbgSessions.userId, context.user.id),
          gt(hbgSessions.expiresAt, now),
          eq(hbgUsers.active, true),
          eq(hbgUsers.role, "owner"),
        ),
      )
      .limit(1);

    const [liveDevelopmentSession] = await tx
      .select({
        tokenHash: hbgDevelopmentSessions.tokenHash,
      })
      .from(hbgDevelopmentSessions)
      .where(
        and(
          eq(
            hbgDevelopmentSessions.tokenHash,
            binding.developmentSessionTokenHash,
          ),
          eq(hbgDevelopmentSessions.userId, context.user.id),
          gt(hbgDevelopmentSessions.expiresAt, now),
          isNull(hbgDevelopmentSessions.endedAt),
        ),
      )
      .limit(1);

    if (!liveSession || !liveDevelopmentSession) {
      throw new PermissionGrantError(
        "La sesión dejó de estar vigente antes de conceder el permiso.",
        401,
        "SESSION_INVALID",
      );
    }

    const [row] = await tx
      .insert(hbgPermissionGrants)
      .values({
        ownerUserId: context.user.id,
        grantedByUserId: context.user.id,
        developmentSessionTokenHash:
          binding.developmentSessionTokenHash,
        permission: REQUIRED_PERMISSION,
        resourcePath,
        reason: input.reason.trim(),
        createdAt,
        expiresAt,
      })
      .returning();

    if (!row) {
      throw new Error("No se pudo guardar el permiso.");
    }

    await recordAudit(
      {
        actorUserId: context.user.id,
        action: "authority.permission_grant.created",
        resource: resourcePath,
        result: "success",
        metadata: {
          grantId: row.id,
          permission: REQUIRED_PERMISSION,
          expiresAt: expiresAt.toISOString(),
          reason: input.reason.trim(),
        },
      },
      tx,
    );

    return row;
  });

  return viewOf(created);
}

export async function revokePermissionGrant(
  context: HBGAuthContext,
  grantId: string,
): Promise<PermissionGrantView> {
  const binding = await assertLiveOwner(context);

  if (
    typeof grantId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      grantId,
    )
  ) {
    throw new PermissionGrantError(
      "El identificador del permiso no es válido.",
      400,
      "INVALID_GRANT_ID",
    );
  }

  const revoked = await db.transaction(async (tx) => {
    const now = new Date();

    const [liveSession] = await tx
      .select({ tokenHash: hbgSessions.tokenHash })
      .from(hbgSessions)
      .innerJoin(hbgUsers, eq(hbgUsers.id, hbgSessions.userId))
      .where(
        and(
          eq(hbgSessions.tokenHash, binding.sessionTokenHash),
          eq(hbgSessions.userId, context.user.id),
          gt(hbgSessions.expiresAt, now),
          eq(hbgUsers.active, true),
          eq(hbgUsers.role, "owner"),
        ),
      )
      .limit(1);

    const [liveDevelopmentSession] = await tx
      .select({
        tokenHash: hbgDevelopmentSessions.tokenHash,
      })
      .from(hbgDevelopmentSessions)
      .where(
        and(
          eq(
            hbgDevelopmentSessions.tokenHash,
            binding.developmentSessionTokenHash,
          ),
          eq(hbgDevelopmentSessions.userId, context.user.id),
          gt(hbgDevelopmentSessions.expiresAt, now),
          isNull(hbgDevelopmentSessions.endedAt),
        ),
      )
      .limit(1);

    if (!liveSession || !liveDevelopmentSession) {
      throw new PermissionGrantError(
        "La sesión dejó de estar vigente.",
        401,
        "SESSION_INVALID",
      );
    }

    const [row] = await tx
      .update(hbgPermissionGrants)
      .set({ revokedAt: now })
      .where(
        and(
          eq(hbgPermissionGrants.id, grantId),
          eq(hbgPermissionGrants.ownerUserId, context.user.id),
          eq(
            hbgPermissionGrants.developmentSessionTokenHash,
            binding.developmentSessionTokenHash,
          ),
          eq(hbgPermissionGrants.permission, REQUIRED_PERMISSION),
          isNull(hbgPermissionGrants.revokedAt),
          gt(hbgPermissionGrants.expiresAt, now),
        ),
      )
      .returning();

    if (!row) {
      throw new PermissionGrantError(
        "El permiso no existe, expiró, ya fue revocado o no pertenece a esta sesión.",
        404,
        "GRANT_NOT_AVAILABLE",
      );
    }

    await recordAudit(
      {
        actorUserId: context.user.id,
        action: "authority.permission_grant.revoked",
        resource: row.resourcePath,
        result: "success",
        metadata: {
          grantId: row.id,
          permission: row.permission,
        },
      },
      tx,
    );

    return row;
  });

  return viewOf(revoked);
}

export async function assertPermissionGrant(
  context: HBGAuthContext,
  resourcePathInput: string,
): Promise<void> {
  const binding = await assertLiveOwner(context);
  const resourcePath = normalizeResourcePath(resourcePathInput);
  const now = new Date();

  const [grant] = await db
    .select({ id: hbgPermissionGrants.id })
    .from(hbgPermissionGrants)
    .innerJoin(
      hbgDevelopmentSessions,
      eq(
        hbgDevelopmentSessions.tokenHash,
        hbgPermissionGrants.developmentSessionTokenHash,
      ),
    )
    .innerJoin(
      hbgUsers,
      eq(hbgUsers.id, hbgPermissionGrants.ownerUserId),
    )
    .where(
      and(
        eq(hbgPermissionGrants.ownerUserId, context.user.id),
        eq(hbgPermissionGrants.grantedByUserId, context.user.id),
        eq(hbgPermissionGrants.permission, REQUIRED_PERMISSION),
        eq(hbgPermissionGrants.resourcePath, resourcePath),
        eq(
          hbgPermissionGrants.developmentSessionTokenHash,
          binding.developmentSessionTokenHash,
        ),
        isNull(hbgPermissionGrants.revokedAt),
        gt(hbgPermissionGrants.expiresAt, now),
        gt(hbgDevelopmentSessions.expiresAt, now),
        isNull(hbgDevelopmentSessions.endedAt),
        eq(hbgDevelopmentSessions.userId, context.user.id),
        eq(hbgUsers.active, true),
        eq(hbgUsers.role, "owner"),
        sql`${hbgPermissionGrants.createdAt} <= ${now}`,
      ),
    )
    .limit(1);

  if (!grant) {
    throw new PermissionGrantError(
      "No existe una concesión vigente para esta ruta y sesión.",
      403,
      "PERMISSION_GRANT_REQUIRED",
    );
  }
}
