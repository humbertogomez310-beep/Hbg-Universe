import assert from "node:assert/strict";
import test from "node:test";

test(
  "HBG registry bootstrap is idempotent, audited, and preserves owner-managed state",
  { skip: !process.env.DATABASE_URL },
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

    try {
      const firstSeed = await ensureDefaultApplications();
      assert.equal(firstSeed.length, ids.length);
      assert.deepEqual(
        firstSeed.map((application) => application.id).sort(),
        [...ids].sort(),
      );

      const core = firstSeed.find((application) => application.id === "hbg-core");
      const auth = firstSeed.find((application) => application.id === "hbg-auth");
      const instinto = firstSeed.find((application) => application.id === "instinto");
      const terminador = firstSeed.find((application) => application.id === "terminador");
      assert.ok(core && isProtectedApplication(core));
      assert.ok(auth && isProtectedApplication(auth));
      assert.ok(terminador && isProtectedApplication(terminador));
      assert.ok(instinto && !isProtectedApplication(instinto));

      const [seedAudit] = await db
        .select({ count: hbgAuditEvents.id })
        .from(hbgAuditEvents)
        .where(eq(hbgAuditEvents.action, "registry.application.seeded"));
      assert.ok(seedAudit);

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
      await db.delete(hbgApplications).where(inArray(hbgApplications.id, ids));
      await db.delete(hbgAuditEvents).where(eq(hbgAuditEvents.action, "registry.application.seeded"));
      await pool.end();
    }
  },
);
