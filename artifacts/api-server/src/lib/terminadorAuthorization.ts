import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull, lte, sql } from "drizzle-orm";
import {
  db,
  hbgApplications,
  hbgDevelopmentSessions,
  hbgSessions,
  hbgTerminadorAuthorizations,
  hbgUsers,
} from "@workspace/db";
import { hasPermission, type HBGAuthContext } from "./hbgAuth";
import { recordAudit } from "./audit";
import { isProtectedApplication } from "./registry";

const AUTHORIZATION_TTL_MS = 5 * 60 * 1000;
const WORKSPACE = "hbg-app-registry";
const OPERATION = "apps.set_status";
const REQUIRED_PERMISSION = "terminador.manage";

export type AuthorizationState =
  | "pending"
  | "approved"
  | "denied"
  | "revoked"
  | "expired"
  | "consumed";

export interface AuthorizationProposalInput {
  applicationId: string;
  status: "active" | "disabled";
  reason: string;
}

export interface AuthorizationView {
  id: string;
  operation: string;
  resource: string;
  applicationId: string;
  workspace: string;
  parameters: Record<string, unknown>;
  requestedPermissions: string[];
  contentHash: string | null;
  proposalHash: string;
  reason: string;
  state: AuthorizationState;
  createdAt: string;
  expiresAt: string;
  approvedAt: string | null;
  revokedAt: string | null;
  consumedAt: string | null;
}

export class AuthorizationError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function proposalDigest(input: {
  id: string;
  ownerUserId: string;
  sessionTokenHash: string;
  developmentSessionTokenHash: string;
  operation: string;
  resource: string;
  applicationId: string;
  workspace: string;
  parameters: Record<string, unknown>;
  requestedPermissions: string[];
  contentHash: string | null;
  reason: string;
  createdAt: Date;
  expiresAt: Date;
}): string {
  return createHash("sha256")
    .update(stableJson([
      input.id,
      input.ownerUserId,
      input.sessionTokenHash,
      input.developmentSessionTokenHash,
      input.operation,
      input.resource,
      input.applicationId,
      input.workspace,
      input.parameters,
      input.requestedPermissions,
      input.contentHash,
      input.reason,
      input.createdAt.toISOString(),
      input.expiresAt.toISOString(),
    ]))
    .digest("hex");
}

function viewOf(row: typeof hbgTerminadorAuthorizations.$inferSelect): AuthorizationView {
  return {
    id: row.id,
    operation: row.operation,
    resource: row.resource,
    applicationId: row.applicationId,
    workspace: row.workspace,
    parameters: row.parameters,
    requestedPermissions: row.requestedPermissions,
    contentHash: row.contentHash,
    proposalHash: row.proposalHash,
    reason: row.reason,
    state: row.state as AuthorizationState,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    approvedAt: row.approvedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    consumedAt: row.consumedAt?.toISOString() ?? null,
  };
}

function requireOwnerDevelopment(context: HBGAuthContext): {
  sessionTokenHash: string;
  developmentSessionTokenHash: string;
} {
  if (context.role !== "owner") {
    throw new AuthorizationError("Solo el OWNER puede autorizar operaciones.", 403, "OWNER_REQUIRED");
  }
  if (!hasPermission(context, REQUIRED_PERMISSION)) {
    throw new AuthorizationError("Permiso insuficiente.", 403, "FORBIDDEN");
  }
  if (
    !context.isDevelopment ||
    !context.sessionTokenHash ||
    !context.developmentSessionTokenHash
  ) {
    throw new AuthorizationError(
      "Se requiere una sesión autenticada del OWNER y una sesión de desarrollo vigente.",
      403,
      "DEVELOPMENT_SESSION_REQUIRED",
    );
  }
  return {
    sessionTokenHash: context.sessionTokenHash,
    developmentSessionTokenHash: context.developmentSessionTokenHash,
  };
}

async function assertLiveOwner(context: HBGAuthContext): Promise<{
  sessionTokenHash: string;
  developmentSessionTokenHash: string;
}> {
  const { sessionTokenHash, developmentSessionTokenHash } =
    requireOwnerDevelopment(context);
  const now = new Date();
  const [session] = await db
    .select({ id: hbgSessions.tokenHash })
    .from(hbgSessions)
    .innerJoin(hbgUsers, eq(hbgUsers.id, hbgSessions.userId))
    .where(
      and(
        eq(hbgSessions.tokenHash, sessionTokenHash),
        eq(hbgSessions.userId, context.user.id),
        gt(hbgSessions.expiresAt, now),
        eq(hbgUsers.active, true),
        eq(hbgUsers.role, "owner"),
      ),
    )
    .limit(1);
  const [developmentSession] = await db
    .select({ id: hbgDevelopmentSessions.tokenHash })
    .from(hbgDevelopmentSessions)
    .where(
      and(
        eq(hbgDevelopmentSessions.tokenHash, developmentSessionTokenHash),
        eq(hbgDevelopmentSessions.userId, context.user.id),
        gt(hbgDevelopmentSessions.expiresAt, now),
        isNull(hbgDevelopmentSessions.endedAt),
      ),
    )
    .limit(1);
  if (!session || !developmentSession) {
    throw new AuthorizationError(
      "La sesión del OWNER o la sesión de desarrollo expiró o fue revocada.",
      401,
      "SESSION_INVALID",
    );
  }
  return { sessionTokenHash, developmentSessionTokenHash };
}

function isValidBinding(
  row: typeof hbgTerminadorAuthorizations.$inferSelect,
  context: HBGAuthContext,
  sessionTokenHash: string,
  developmentSessionTokenHash: string,
): boolean {
  return (
    row.ownerUserId === context.user.id &&
    row.sessionTokenHash === sessionTokenHash &&
    row.developmentSessionTokenHash === developmentSessionTokenHash &&
    row.proposalHash === proposalDigest(row)
  );
}

function auditInput(
  row: typeof hbgTerminadorAuthorizations.$inferSelect,
  action: string,
  result: "success" | "failure" | "denied",
  metadata: Record<string, unknown> = {},
) {
  return {
    actorUserId: row.ownerUserId,
    action,
    resource: row.resource,
    result,
    metadata: {
      sessionId: row.sessionTokenHash,
      developmentSessionId: row.developmentSessionTokenHash,
      proposalId: row.id,
      operation: row.operation,
      applicationId: row.applicationId,
      workspace: row.workspace,
      ...metadata,
    },
  } as const;
}

export async function createAuthorizationProposal(
  context: HBGAuthContext,
  input: AuthorizationProposalInput,
): Promise<AuthorizationView> {
  const { sessionTokenHash, developmentSessionTokenHash } =
    await assertLiveOwner(context);
  if (
    !/^[a-zA-Z0-9_.-]{1,64}$/.test(input.applicationId) ||
    !["active", "disabled"].includes(input.status) ||
    input.reason.trim().length < 1 ||
    input.reason.trim().length > 500
  ) {
    throw new AuthorizationError("La propuesta no es válida.", 400, "INVALID_PROPOSAL");
  }

  const [application] = await db
    .select()
    .from(hbgApplications)
    .where(eq(hbgApplications.id, input.applicationId))
    .limit(1);
  if (!application) {
    throw new AuthorizationError("La aplicación no existe.", 404, "APP_NOT_FOUND");
  }
  if (isProtectedApplication(application)) {
    throw new AuthorizationError(
      "La aplicación está protegida y no admite esta propuesta.",
      409,
      "APP_PROTECTED",
    );
  }
  if (application.status === input.status) {
    throw new AuthorizationError(
      "La aplicación ya tiene el estado solicitado.",
      409,
      "NO_CHANGE",
    );
  }

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + AUTHORIZATION_TTL_MS);
  const row = {
    id: randomUUID(),
    ownerUserId: context.user.id,
    sessionTokenHash,
    developmentSessionTokenHash,
    operation: OPERATION,
    resource: `application:${application.id}`,
    applicationId: application.id,
    workspace: WORKSPACE,
    parameters: {
      currentStatus: application.status,
      requestedStatus: input.status,
    },
    requestedPermissions: [REQUIRED_PERMISSION],
    contentHash: null,
    reason: input.reason.trim(),
    state: "pending",
    createdAt,
    expiresAt,
  };
  const proposalHash = proposalDigest(row);
  const [created] = await db.transaction(async (tx) => {
    await recordAudit(
      {
        actorUserId: context.user.id,
        action: "terminador.authorization.validation.succeeded",
        resource: row.resource,
        result: "success",
        metadata: {
          sessionId: sessionTokenHash,
          developmentSessionId: developmentSessionTokenHash,
          proposalId: row.id,
          operation: row.operation,
          applicationId: row.applicationId,
          workspace: row.workspace,
          requestedPermissions: row.requestedPermissions,
          proposalHash,
        },
      },
      tx,
    );
    await recordAudit(
      {
        actorUserId: context.user.id,
        action: "terminador.authorization.proposal.created",
        resource: row.resource,
        result: "success",
        metadata: {
          sessionId: sessionTokenHash,
          developmentSessionId: developmentSessionTokenHash,
          proposalId: row.id,
          operation: row.operation,
          applicationId: row.applicationId,
          workspace: row.workspace,
          parameters: row.parameters,
          requestedPermissions: row.requestedPermissions,
          proposalHash,
          expiresAt: expiresAt.toISOString(),
        },
      },
      tx,
    );
    return tx
      .insert(hbgTerminadorAuthorizations)
      .values({ ...row, proposalHash })
      .returning();
  });
  if (!created) throw new Error("No se pudo persistir la propuesta.");
  return viewOf(created);
}

async function loadBoundProposal(
  context: HBGAuthContext,
  id: string,
) {
  const { sessionTokenHash, developmentSessionTokenHash } =
    await assertLiveOwner(context);
  const [row] = await db
    .select()
    .from(hbgTerminadorAuthorizations)
    .where(eq(hbgTerminadorAuthorizations.id, id))
    .limit(1);
  if (!row) {
    throw new AuthorizationError("La propuesta no existe.", 404, "PROPOSAL_NOT_FOUND");
  }
  if (!isValidBinding(row, context, sessionTokenHash, developmentSessionTokenHash)) {
    throw new AuthorizationError(
      "La propuesta no pertenece a esta identidad y sesión o su contenido cambió.",
      403,
      "PROPOSAL_BINDING_MISMATCH",
    );
  }
  return row;
}

async function expireProposal(
  row: typeof hbgTerminadorAuthorizations.$inferSelect,
): Promise<typeof hbgTerminadorAuthorizations.$inferSelect> {
  if (
    (row.state !== "pending" && row.state !== "approved") ||
    row.expiresAt.getTime() > Date.now()
  ) {
    return row;
  }
  const [expired] = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(hbgTerminadorAuthorizations)
      .set({ state: "expired" })
      .where(
        and(
          eq(hbgTerminadorAuthorizations.id, row.id),
          eq(hbgTerminadorAuthorizations.state, row.state),
          lte(hbgTerminadorAuthorizations.expiresAt, new Date()),
        ),
      )
      .returning();
    if (updated) {
      await recordAudit(auditInput(updated, "terminador.authorization.expired", "failure"), tx);
      return [updated];
    }
    return tx
      .select()
      .from(hbgTerminadorAuthorizations)
      .where(eq(hbgTerminadorAuthorizations.id, row.id))
      .limit(1);
  });
  return expired ?? row;
}

export async function getAuthorization(
  context: HBGAuthContext,
  id: string,
): Promise<AuthorizationView> {
  const row = await loadBoundProposal(context, id);
  return viewOf(await expireProposal(row));
}

export async function listAuthorizations(
  context: HBGAuthContext,
): Promise<AuthorizationView[]> {
  const { sessionTokenHash, developmentSessionTokenHash } =
    await assertLiveOwner(context);
  const rows = await db
    .select()
    .from(hbgTerminadorAuthorizations)
    .where(
      and(
        eq(hbgTerminadorAuthorizations.ownerUserId, context.user.id),
        eq(hbgTerminadorAuthorizations.sessionTokenHash, sessionTokenHash),
        eq(
          hbgTerminadorAuthorizations.developmentSessionTokenHash,
          developmentSessionTokenHash,
        ),
      ),
    )
    .orderBy(desc(hbgTerminadorAuthorizations.createdAt))
    .limit(50);
  const authorizations: AuthorizationView[] = [];
  for (const row of rows) {
    if (!isValidBinding(row, context, sessionTokenHash, developmentSessionTokenHash)) {
      throw new AuthorizationError(
        "Una propuesta persistida no coincide con su contenido original.",
        409,
        "PROPOSAL_BINDING_MISMATCH",
      );
    }
    authorizations.push(viewOf(await expireProposal(row)));
  }
  return authorizations;
}

export async function approveAuthorization(
  context: HBGAuthContext,
  id: string,
): Promise<AuthorizationView> {
  const row = await loadBoundProposal(context, id);
  const current = await expireProposal(row);
  if (current.state !== "pending") {
    throw new AuthorizationError(
      "La propuesta ya no está pendiente de aprobación.",
      409,
      `PROPOSAL_${current.state.toUpperCase()}`,
    );
  }
  if (current.expiresAt.getTime() <= Date.now()) {
    throw new AuthorizationError("La propuesta expiró.", 410, "PROPOSAL_EXPIRED");
  }

  const [application] = await db
    .select()
    .from(hbgApplications)
    .where(eq(hbgApplications.id, current.applicationId))
    .limit(1);
  if (
    !application ||
    isProtectedApplication(application) ||
    application.status !== current.parameters.currentStatus
  ) {
    await db.transaction(async (tx) => {
      const [invalidated] = await tx
        .update(hbgTerminadorAuthorizations)
        .set({ state: "revoked", revokedAt: new Date() })
        .where(
          and(
            eq(hbgTerminadorAuthorizations.id, current.id),
            eq(hbgTerminadorAuthorizations.state, "pending"),
          ),
        )
        .returning();
      if (invalidated) {
        await recordAudit(
          auditInput(invalidated, "terminador.authorization.revoked", "denied", {
            reason: "bound-resource-changed-before-approval",
          }),
          tx,
        );
      }
    });
    throw new AuthorizationError(
      "El recurso cambió desde que se presentó la propuesta; se requiere una propuesta nueva.",
      409,
      "PROPOSAL_STALE",
    );
  }

  const { sessionTokenHash } = requireOwnerDevelopment(context);
  const [approved] = await db.transaction(async (tx) => {
    const approvalTime = new Date();
    await recordAudit(
      auditInput(current, "terminador.authorization.revalidated", "success"),
      tx,
    );
    await recordAudit(
      auditInput(current, "terminador.authorization.approval.requested", "success"),
      tx,
    );
    const [updated] = await tx
      .update(hbgTerminadorAuthorizations)
      .set({
        state: "approved",
        approvedAt: approvalTime,
        approvedByUserId: context.user.id,
        approvalSessionTokenHash: sessionTokenHash,
      })
      .where(
        and(
          eq(hbgTerminadorAuthorizations.id, current.id),
          eq(hbgTerminadorAuthorizations.state, "pending"),
          eq(hbgTerminadorAuthorizations.ownerUserId, context.user.id),
          eq(hbgTerminadorAuthorizations.sessionTokenHash, sessionTokenHash),
          eq(
            hbgTerminadorAuthorizations.developmentSessionTokenHash,
            context.developmentSessionTokenHash!,
          ),
          gt(hbgTerminadorAuthorizations.expiresAt, approvalTime),
          sql`EXISTS (
            SELECT 1 FROM hbg_sessions s
            JOIN hbg_users u ON u.id = s.user_id
            WHERE s.token_hash = ${sessionTokenHash}
              AND s.user_id = ${context.user.id}
              AND s.expires_at > ${approvalTime}
              AND u.active = TRUE
              AND u.role = 'owner'
          )`,
          sql`EXISTS (
            SELECT 1 FROM hbg_development_sessions d
            WHERE d.token_hash = ${context.developmentSessionTokenHash}
              AND d.user_id = ${context.user.id}
              AND d.expires_at > ${approvalTime}
              AND d.ended_at IS NULL
          )`,
        ),
      )
      .returning();
    if (updated) {
      await recordAudit(
        auditInput(updated, "terminador.authorization.approved", "success", {
          approvedAt: updated.approvedAt?.toISOString(),
        }),
        tx,
      );
    }
    return [updated];
  });
  if (!approved) {
    throw new AuthorizationError(
      "La propuesta cambió o expiró antes de la aprobación.",
      409,
      "PROPOSAL_STATE_CHANGED",
    );
  }
  return viewOf(approved);
}

export async function denyAuthorization(
  context: HBGAuthContext,
  id: string,
): Promise<AuthorizationView> {
  const current = await expireProposal(await loadBoundProposal(context, id));
  if (current.state !== "pending") {
    throw new AuthorizationError(
      "Solo se puede denegar una propuesta pendiente.",
      409,
      `PROPOSAL_${current.state.toUpperCase()}`,
    );
  }
  const [denied] = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(hbgTerminadorAuthorizations)
      .set({ state: "denied", deniedAt: new Date() })
      .where(
        and(
          eq(hbgTerminadorAuthorizations.id, current.id),
          eq(hbgTerminadorAuthorizations.state, "pending"),
          eq(hbgTerminadorAuthorizations.ownerUserId, context.user.id),
          eq(hbgTerminadorAuthorizations.sessionTokenHash, current.sessionTokenHash),
          eq(
            hbgTerminadorAuthorizations.developmentSessionTokenHash,
            current.developmentSessionTokenHash,
          ),
        ),
      )
      .returning();
    if (updated) {
      await recordAudit(
        auditInput(updated, "terminador.authorization.denied", "denied"),
        tx,
      );
    }
    return [updated];
  });
  if (!denied) {
    throw new AuthorizationError(
      "La propuesta cambió antes de poder denegarla.",
      409,
      "PROPOSAL_STATE_CHANGED",
    );
  }
  return viewOf(denied);
}

export async function revokeAuthorization(
  context: HBGAuthContext,
  id: string,
): Promise<AuthorizationView> {
  const current = await expireProposal(await loadBoundProposal(context, id));
  if (current.state !== "pending" && current.state !== "approved") {
    throw new AuthorizationError(
      "La propuesta ya no puede revocarse.",
      409,
      `PROPOSAL_${current.state.toUpperCase()}`,
    );
  }
  const [revoked] = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(hbgTerminadorAuthorizations)
      .set({ state: "revoked", revokedAt: new Date() })
      .where(
        and(
          eq(hbgTerminadorAuthorizations.id, current.id),
          eq(hbgTerminadorAuthorizations.state, current.state),
        ),
      )
      .returning();
    if (updated) {
      await recordAudit(
        auditInput(updated, "terminador.authorization.revoked", "success"),
        tx,
      );
    }
    return [updated];
  });
  if (!revoked) {
    throw new AuthorizationError(
      "La propuesta cambió antes de poder revocarla.",
      409,
      "PROPOSAL_STATE_CHANGED",
    );
  }
  return viewOf(revoked);
}

export async function consumeAuthorization(
  context: HBGAuthContext,
  id: string,
): Promise<AuthorizationView> {
  const { sessionTokenHash, developmentSessionTokenHash } =
    await assertLiveOwner(context);
  const outcome = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(hbgTerminadorAuthorizations)
      .where(eq(hbgTerminadorAuthorizations.id, id))
      .for("update")
      .limit(1);
    if (!row) {
      return { error: new AuthorizationError("La propuesta no existe.", 404, "PROPOSAL_NOT_FOUND") };
    }
    await recordAudit(
      auditInput(row, "terminador.authorization.consume.attempted", "success"),
      tx,
    );
    if (!isValidBinding(row, context, sessionTokenHash, developmentSessionTokenHash)) {
      await recordAudit(
        auditInput(row, "terminador.authorization.consume.denied", "denied", {
          reason: "proposal-binding-mismatch",
        }),
        tx,
      );
      return {
        error: new AuthorizationError(
          "La propuesta no pertenece a esta identidad y sesión o su contenido cambió.",
          403,
          "PROPOSAL_BINDING_MISMATCH",
        ),
      };
    }
    if (
      (row.state === "pending" || row.state === "approved") &&
      row.expiresAt.getTime() <= Date.now()
    ) {
      const [expired] = await tx
        .update(hbgTerminadorAuthorizations)
        .set({ state: "expired" })
        .where(
          and(
            eq(hbgTerminadorAuthorizations.id, row.id),
            eq(hbgTerminadorAuthorizations.state, row.state),
            lte(hbgTerminadorAuthorizations.expiresAt, new Date()),
          ),
        )
        .returning();
      if (expired) {
        await recordAudit(
          auditInput(expired, "terminador.authorization.expired", "failure"),
          tx,
        );
      }
      return { error: new AuthorizationError("La autorización expiró.", 410, "PROPOSAL_EXPIRED") };
    }
    if (
      row.state !== "approved" ||
      row.approvedByUserId !== context.user.id ||
      row.approvalSessionTokenHash !== sessionTokenHash
    ) {
      await recordAudit(
        auditInput(row, "terminador.authorization.consume.denied", "denied", {
          observedState: row.state,
        }),
        tx,
      );
      return {
        error: new AuthorizationError(
          "La autorización no está aprobada para esta operación y sesión.",
          409,
          row.state === "consumed" ? "AUTHORIZATION_REUSED" : "AUTHORIZATION_NOT_APPROVED",
        ),
      };
    }

    const [application] = await tx
      .select()
      .from(hbgApplications)
      .where(eq(hbgApplications.id, row.applicationId))
      .limit(1);
    if (
      !application ||
      isProtectedApplication(application) ||
      application.status !== row.parameters.currentStatus
    ) {
      const [revoked] = await tx
        .update(hbgTerminadorAuthorizations)
        .set({ state: "revoked", revokedAt: new Date() })
        .where(
          and(
            eq(hbgTerminadorAuthorizations.id, row.id),
            eq(hbgTerminadorAuthorizations.state, "approved"),
          ),
        )
        .returning();
      if (revoked) {
        await recordAudit(
          auditInput(revoked, "terminador.authorization.revoked", "denied", {
            reason: "bound-resource-changed",
          }),
          tx,
        );
      }
      return {
        error: new AuthorizationError(
          "El recurso cambió; la autorización quedó invalidada.",
          409,
          "PROPOSAL_STALE",
        ),
      };
    }

    const now = new Date();
    await recordAudit(
      auditInput(row, "terminador.authorization.revalidated", "success"),
      tx,
    );
    const [consumed] = await tx
      .update(hbgTerminadorAuthorizations)
      .set({ state: "consumed", consumedAt: now })
      .where(
        and(
          eq(hbgTerminadorAuthorizations.id, row.id),
          eq(hbgTerminadorAuthorizations.state, "approved"),
          eq(hbgTerminadorAuthorizations.ownerUserId, context.user.id),
          eq(hbgTerminadorAuthorizations.sessionTokenHash, sessionTokenHash),
          eq(
            hbgTerminadorAuthorizations.developmentSessionTokenHash,
            developmentSessionTokenHash,
          ),
          eq(hbgTerminadorAuthorizations.proposalHash, row.proposalHash),
          gt(hbgTerminadorAuthorizations.expiresAt, now),
          sql`EXISTS (
            SELECT 1 FROM hbg_sessions s
            JOIN hbg_users u ON u.id = s.user_id
            WHERE s.token_hash = ${sessionTokenHash}
              AND s.user_id = ${context.user.id}
              AND s.expires_at > ${now}
              AND u.active = TRUE
              AND u.role = 'owner'
          )`,
          sql`EXISTS (
            SELECT 1 FROM hbg_development_sessions d
            WHERE d.token_hash = ${developmentSessionTokenHash}
              AND d.user_id = ${context.user.id}
              AND d.expires_at > ${now}
              AND d.ended_at IS NULL
          )`,
        ),
      )
      .returning();
    if (!consumed) {
      await recordAudit(
        auditInput(row, "terminador.authorization.consume.denied", "denied", {
          reason: "atomic-consume-conflict-or-session-expired",
        }),
        tx,
      );
      return {
        error: new AuthorizationError(
          "La autorización ya se consumió, expiró o fue revocada.",
          409,
          "AUTHORIZATION_NOT_CONSUMABLE",
        ),
      };
    }
    await recordAudit(
      auditInput(consumed, "terminador.authorization.consumed", "success", {
        consumedAt: now.toISOString(),
      }),
      tx,
    );
    return { authorization: consumed };
  });
  if (outcome.error) throw outcome.error;
  if (!outcome.authorization) throw new Error("El consumo no produjo un estado persistido.");
  return viewOf(outcome.authorization);
}
