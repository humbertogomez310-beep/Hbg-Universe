import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import app from "../app.ts";
import { ensureDefaultApplications } from "../lib/registry.ts";

test(
  "health endpoint reports ready only after the versioned HBG schema and registry are present",
  { skip: !process.env.DATABASE_URL },
  async () => {
    await ensureDefaultApplications();
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const response = await fetch(`http://127.0.0.1:${address.port}/api/healthz`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "ok" });
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  },
);
