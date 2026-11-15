import assert from "node:assert/strict";
import test from "node:test";

test(
  "audit metadata recursively removes sensitive keys in nested objects and arrays",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const { recordAudit } = await import("./audit.ts");
    let inserted;
    const writer = {
      insert() {
        return {
          values(value) {
            inserted = value;
            return Promise.resolve();
          },
        };
      },
    };

    const cyclic = { publicValue: "kept" };
    cyclic.self = cyclic;
    await recordAudit(
      {
        action: "authority.test",
        resource: "safe-fixture",
        result: "success",
        metadata: {
          publicValue: "kept",
          nested: {
            password: "fake-test-password",
            developmentSessionId: "fake-test-session-hash",
            child: { apiKey: "fake-test-key", publicValue: true },
          },
          entries: [
            { access_token: "fake-test-token", label: "kept" },
            { label: "token value should be redacted" },
          ],
          cyclic,
        },
      },
      writer,
    );

    assert.equal(Object.getPrototypeOf(inserted.metadata), Object.prototype);
    assert.equal(Object.getPrototypeOf(inserted.metadata.nested), Object.prototype);
    const { db, hbgAuditEvents } = await import("@workspace/db");
    assert.doesNotThrow(() => db.insert(hbgAuditEvents).values(inserted));

    const stored = JSON.parse(JSON.stringify(inserted.metadata));
    assert.deepEqual(stored, {
      publicValue: "kept",
      nested: { child: { publicValue: true } },
      entries: [{ label: "kept" }, { label: "[REDACTED]" }],
      cyclic: { publicValue: "kept", self: "[CIRCULAR]" },
    });
    assert.equal(JSON.stringify(stored).includes("fake-test"), false);
  },
);

test(
  "audit storage errors propagate to the caller for fail-closed handling",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const { recordAudit } = await import("./audit.ts");
    const writer = {
      insert() {
        return {
          values() {
            throw new Error("audit test storage failure");
          },
        };
      },
    };

    await assert.rejects(
      recordAudit(
        {
          action: "authority.test",
          resource: "safe-fixture",
          result: "denied",
        },
        writer,
      ),
      /audit test storage failure/,
    );
  },
);
