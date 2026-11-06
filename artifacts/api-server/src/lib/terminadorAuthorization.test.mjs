import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

test(
  "HBG Authority persists, binds, expires, revokes, and atomically consumes proposals",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const {
      db,
      hbgApplications,
      hbgAuditEvents,
      hbgDevelopmentSessions,
      hbgSessions,
      hbgTerminadorAuthorizations,
      hbgUsers,
      pool,
    } = await import("@workspace/db");
    const { and, eq } = await import("drizzle-orm");
    const { hashSecret, permissionsFor } = await import("./hbgAuth.ts");
    const {
      approveAuthorization,
      AuthorizationError,
      consumeAuthorization,
      createAuthorizationProposal,
      denyAuthorization,
      getAuthorization,
      revokeAuthorization,
    } = await import("./terminadorAuthorization.ts");

    const username = `terminador_test_${randomUUID().replaceAll("-", "")}`;
    const [user] = await db
      .insert(hbgUsers)
      .values({ username, role: "owner" })
      .returning();
    assert.ok(user);
    const sessionTokenHash = hashSecret(randomUUID());
    const developmentSessionTokenHash = hashSecret(randomUUID());
    const sessionExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const appIds = Array.from({ length: 8 }, (_, index) =>
      `auth-test-${randomUUID().slice(0, 8)}-${index}`,
    );

    try {
      await db.insert(hbgSessions).values({
        tokenHash: sessionTokenHash,
        userId: user.id,
        expiresAt: sessionExpiresAt,
      });
      await db.insert(hbgDevelopmentSessions).values({
        tokenHash: developmentSessionTokenHash,
        userId: user.id,
        purpose: "integration test only",
        expiresAt: sessionExpiresAt,
      });
      const context = {
        user,
        role: "owner",
        permissions: permissionsFor(user),
        isDevelopment: true,
        sessionTokenHash,
        sessionExpiresAt,
        developmentSessionTokenHash,
        developmentSessionExpiresAt: sessionExpiresAt,
      };
      await db.insert(hbgApplications).values(
        appIds.map((id) => ({
          id,
          name: `Authorization test ${id}`,
          version: "test",
          status: "active",
          capabilities: [],
        })),
      );

      const proposal = await createAuthorizationProposal(context, {
        applicationId: appIds[0],
        status: "disabled",
        reason: "Integration test: disable only this fixture.",
      });
      assert.equal(proposal.state, "pending");
      assert.equal(proposal.operation, "apps.set_status");
      assert.equal(proposal.workspace, "hbg-app-registry");
      assert.equal(proposal.parameters.currentStatus, "active");
      assert.equal(proposal.parameters.requestedStatus, "disabled");
      assert.equal(proposal.contentHash, null);
      assert.match(proposal.proposalHash, /^[a-f0-9]{64}$/);

      const alternateSessionHash = hashSecret(randomUUID());
      const alternateDevelopmentHash = hashSecret(randomUUID());
      await db.insert(hbgSessions).values({
        tokenHash: alternateSessionHash,
        userId: user.id,
        expiresAt: sessionExpiresAt,
      });
      await db.insert(hbgDevelopmentSessions).values({
        tokenHash: alternateDevelopmentHash,
        userId: user.id,
        purpose: "wrong-session integration test",
        expiresAt: sessionExpiresAt,
      });
      await assert.rejects(
        getAuthorization(
          {
            ...context,
            sessionTokenHash: alternateSessionHash,
            developmentSessionTokenHash: alternateDevelopmentHash,
          },
          proposal.id,
        ),
        (error) => error instanceof AuthorizationError && error.code === "PROPOSAL_BINDING_MISMATCH",
      );

      await assert.rejects(
        consumeAuthorization(context, proposal.id),
        (error) => error instanceof AuthorizationError && error.code === "AUTHORIZATION_NOT_APPROVED",
      );
      const approved = await approveAuthorization(context, proposal.id);
      assert.equal(approved.state, "approved");

      const concurrent = await Promise.allSettled([
        consumeAuthorization(context, proposal.id),
        consumeAuthorization(context, proposal.id),
      ]);
      assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1);
      assert.equal((await getAuthorization(context, proposal.id)).state, "consumed");
      const [unchangedApplication] = await db
        .select({ status: hbgApplications.status })
        .from(hbgApplications)
        .where(eq(hbgApplications.id, appIds[0]));
      assert.equal(unchangedApplication.status, "active");
      await assert.rejects(
        consumeAuthorization(context, proposal.id),
        (error) => error instanceof AuthorizationError && error.code === "AUTHORIZATION_REUSED",
      );

      const revoked = await createAuthorizationProposal(context, {
        applicationId: appIds[1],
        status: "disabled",
        reason: "Integration test: revoke.",
      });
      await approveAuthorization(context, revoked.id);
      assert.equal((await revokeAuthorization(context, revoked.id)).state, "revoked");
      await assert.rejects(
        consumeAuthorization(context, revoked.id),
        (error) => error instanceof AuthorizationError && error.code === "AUTHORIZATION_NOT_APPROVED",
      );

      const denied = await createAuthorizationProposal(context, {
        applicationId: appIds[2],
        status: "disabled",
        reason: "Integration test: deny.",
      });
      assert.equal((await denyAuthorization(context, denied.id)).state, "denied");

      const expired = await createAuthorizationProposal(context, {
        applicationId: appIds[3],
        status: "disabled",
        reason: "Integration test: expire.",
      });
      await approveAuthorization(context, expired.id);
      await db
        .update(hbgTerminadorAuthorizations)
        .set({ expiresAt: new Date(Date.now() - 1_000) })
        .where(eq(hbgTerminadorAuthorizations.id, expired.id));
      await assert.rejects(
        consumeAuthorization(context, expired.id),
        (error) => error instanceof AuthorizationError && error.code === "PROPOSAL_EXPIRED",
      );
      assert.equal((await getAuthorization(context, expired.id)).state, "expired");

      const tampered = await createAuthorizationProposal(context, {
        applicationId: appIds[4],
        status: "disabled",
        reason: "Integration test: binding integrity.",
      });
      await db
        .update(hbgTerminadorAuthorizations)
        .set({
          resource: `application:${appIds[0]}`,
          workspace: "different-workspace",
          parameters: { currentStatus: "active", requestedStatus: "active" },
          requestedPermissions: ["universe.read"],
        })
        .where(eq(hbgTerminadorAuthorizations.id, tampered.id));
      await assert.rejects(
        getAuthorization(context, tampered.id),
        (error) => error instanceof AuthorizationError && error.code === "PROPOSAL_BINDING_MISMATCH",
      );

      const auditEvents = await db
        .select({ action: hbgAuditEvents.action })
        .from(hbgAuditEvents)
        .where(eq(hbgAuditEvents.actorUserId, user.id));
      const actions = new Set(auditEvents.map(({ action }) => action));
      for (const action of [
        "terminador.authorization.validation.succeeded",
        "terminador.authorization.proposal.created",
        "terminador.authorization.revalidated",
        "terminador.authorization.approval.requested",
        "terminador.authorization.approved",
        "terminador.authorization.consume.attempted",
        "terminador.authorization.consumed",
        "terminador.authorization.revoked",
        "terminador.authorization.denied",
        "terminador.authorization.expired",
      ]) {
        assert.ok(actions.has(action), `Missing audit event ${action}`);
      }

      const insufficient = { ...context, permissions: new Set() };
      await assert.rejects(
        createAuthorizationProposal(insufficient, {
          applicationId: appIds[0],
          status: "active",
          reason: "Must not pass",
        }),
        (error) => error instanceof AuthorizationError && error.code === "FORBIDDEN",
      );
      const wrongIdentity = {
        ...context,
        user: { ...user, id: randomUUID() },
      };
      await assert.rejects(
        getAuthorization(wrongIdentity, proposal.id),
        (error) => error instanceof AuthorizationError && error.code === "SESSION_INVALID",
      );

      const userRole = { ...context, role: "user", permissions: new Set() };
      await assert.rejects(
        createAuthorizationProposal(userRole, {
          applicationId: appIds[0],
          status: "active",
          reason: "Must not pass",
        }),
        (error) => error instanceof AuthorizationError && error.code === "OWNER_REQUIRED",
      );

      const noSession = {
        ...context,
        sessionTokenHash: hashSecret(randomUUID()),
      };
      await assert.rejects(
        getAuthorization(noSession, proposal.id),
        (error) => error instanceof AuthorizationError && error.code === "SESSION_INVALID",
      );

      const staleSessionProposal = await createAuthorizationProposal(context, {
        applicationId: appIds[5],
        status: "disabled",
        reason: "Integration test: revoked development session.",
      });
      const approvedThenRevokedSession = await createAuthorizationProposal(context, {
        applicationId: appIds[6],
        status: "disabled",
        reason: "Integration test: session revoked after approval.",
      });
      await approveAuthorization(context, approvedThenRevokedSession.id);
      const staleResource = await createAuthorizationProposal(context, {
        applicationId: appIds[7],
        status: "disabled",
        reason: "Integration test: resource changes before approval.",
      });
      await db
        .update(hbgApplications)
        .set({ status: "disabled" })
        .where(eq(hbgApplications.id, appIds[7]));
      await assert.rejects(
        approveAuthorization(context, staleResource.id),
        (error) => error instanceof AuthorizationError && error.code === "PROPOSAL_STALE",
      );
      assert.equal((await getAuthorization(context, staleResource.id)).state, "revoked");

      await db
        .update(hbgDevelopmentSessions)
        .set({ endedAt: new Date() })
        .where(eq(hbgDevelopmentSessions.tokenHash, developmentSessionTokenHash));
      await assert.rejects(
        approveAuthorization(context, staleSessionProposal.id),
        (error) => error instanceof AuthorizationError && error.code === "SESSION_INVALID",
      );
      await assert.rejects(
        consumeAuthorization(context, approvedThenRevokedSession.id),
        (error) => error instanceof AuthorizationError && error.code === "SESSION_INVALID",
      );

      await db
        .update(hbgSessions)
        .set({ expiresAt: new Date(Date.now() - 1_000) })
        .where(eq(hbgSessions.tokenHash, sessionTokenHash));
      await assert.rejects(
        getAuthorization(context, proposal.id),
        (error) => error instanceof AuthorizationError && error.code === "SESSION_INVALID",
      );
    } finally {
      await db.delete(hbgTerminadorAuthorizations).where(eq(hbgTerminadorAuthorizations.ownerUserId, user.id));
      await db.delete(hbgAuditEvents).where(eq(hbgAuditEvents.actorUserId, user.id));
      await db.delete(hbgSessions).where(eq(hbgSessions.userId, user.id));
      await db.delete(hbgDevelopmentSessions).where(eq(hbgDevelopmentSessions.userId, user.id));
      await db.delete(hbgApplications).where(and(...appIds.map((id) => eq(hbgApplications.id, id))));
      await db.delete(hbgUsers).where(eq(hbgUsers.id, user.id));
      await pool.end();
    }
  },
);
