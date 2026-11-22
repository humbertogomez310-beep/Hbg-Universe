import assert from "node:assert/strict";
import test from "node:test";

const isolatedTestDatabase =
  process.env.NODE_ENV === "test" &&
  /\/hbg_universe_test(?:\?|$)/.test(process.env.DATABASE_URL ?? "");

test(
  "HBG registry bootstrap is idempotent, audited, and preserves owner-managed state",
  { skip: !isolatedTestDatabase },
  async () => {
    const { inArray, eq } = await import("drizzle-orm");
    const {
      db,
      hbgApplications,
      hbgAuditEvents,
      pool,
    } = await import("@workspace/db");
    const { ensureDefaultApplications, isProtectedApplication } = await import("./registry.ts");
    const ids = ["hbg-core", "hbg-auth", "universo", "instinto", "vibra", "terminador"];
    const existingRows = await db
      .select()
      .from(hbgApplications)
      .where(inArray(hbgApplications.id, ids));
    const existingById = new Map(existingRows.map((application) => [application.id, application]));
    const existingAuditRows = await db
      .select({ id: hbgAuditEvents.id })
      .from(hbgAuditEvents)
      .where(eq(hbgAuditEvents.action, "registry.application.seeded"));
    const existingAuditIds = new Set(existingAuditRows.map((event) => event.id));
    let insertedIds = [];

    try {
      const firstSeed = await ensureDefaultApplications();
      insertedIds = firstSeed.map((application) => application.id);
      assert.equal(firstSeed.length, ids.length - existingRows.length);

      const [core] = await db.select().from(hbgApplications).where(eq(hbgApplications.id, "hbg-core"));
      const [auth] = await db.select().from(hbgApplications).where(eq(hbgApplications.id, "hbg-auth"));
      const [instinto] = await db.select().from(hbgApplications).where(eq(hbgApplications.id, "instinto"));
      const [terminador] = await db.select().from(hbgApplications).where(eq(hbgApplications.id, "terminador"));
      const [universo] = await db.select().from(hbgApplications).where(eq(hbgApplications.id, "universo"));
      assert.ok(core && isProtectedApplication(core));
      assert.ok(auth && isProtectedApplication(auth));
      assert.ok(terminador && isProtectedApplication(terminador));
      assert.ok(universo && isProtectedApplication(universo));
      assert.ok(instinto && !isProtectedApplication(instinto));

      const auditRows = await db
        .select({ id: hbgAuditEvents.id })
        .from(hbgAuditEvents)
        .where(eq(hbgAuditEvents.action, "registry.application.seeded"));
      assert.ok(auditRows.length >= existingAuditRows.length + firstSeed.length);

      await db
        .update(hbgApplications)
        .set({ status: "disabled" })
        .where(eq(hbgApplications.id, "instinto"));

      const secondSeed = await ensureDefaultApplications();
      assert.equal(secondSeed.length, 0);

      const [preserved] = await db
        .select({ status: hbgApplications.status })
        .from(hbgApplications)
        .where(eq(hbgApplications.id, "instinto"));
      assert.equal(preserved.status, "disabled");
    } finally {
      const previousInstinto = existingById.get("instinto");
      if (previousInstinto) {
        await db
          .update(hbgApplications)
          .set({ status: previousInstinto.status })
          .where(eq(hbgApplications.id, "instinto"));
      }
      if (insertedIds.length > 0) {
        await db.delete(hbgApplications).where(inArray(hbgApplications.id, insertedIds));
      }
      const auditRows = await db
        .select({ id: hbgAuditEvents.id })
        .from(hbgAuditEvents)
        .where(eq(hbgAuditEvents.action, "registry.application.seeded"));
      const createdAuditIds = auditRows
        .map((event) => event.id)
        .filter((id) => !existingAuditIds.has(id));
      if (createdAuditIds.length > 0) {
        await db.delete(hbgAuditEvents).where(inArray(hbgAuditEvents.id, createdAuditIds));
      }
      await pool.end();
    }
  },
);
