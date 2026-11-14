import assert from "node:assert/strict";
import test from "node:test";

test(
  "Terminador permission guard denies by default and blocks when audit is unavailable",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const { createTerminadorPermissionGuard } = await import("../routes/terminador.ts");
    const audits = [];

    const invoke = async ({ context, auditWriter }) => {
      const response = {
        statusCode: 200,
        body: undefined,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(body) {
          this.body = body;
          return this;
        },
      };
      let nextCalled = false;
      const request = {
        hbgAuth: context,
        path: "/apps",
        method: "GET",
        log: { error() {} },
      };
      await createTerminadorPermissionGuard("terminador.use", auditWriter)(
        request,
        response,
        () => {
          nextCalled = true;
        },
      );
      return { ...response, nextCalled };
    };

    const denied = await invoke({
      context: {
        user: { id: "test-user" },
        role: "user",
        permissions: new Set(),
      },
      auditWriter: async (entry) => audits.push(entry),
    });
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.nextCalled, false);
    assert.equal(audits.at(-1).result, "denied");

    const auditFailure = await invoke({
      context: {
        user: { id: "test-owner" },
        role: "owner",
        permissions: new Set(["terminador.use"]),
      },
      auditWriter: async () => {
        throw new Error("audit test storage failure");
      },
    });
    assert.equal(auditFailure.statusCode, 503);
    assert.equal(auditFailure.body.code, "AUDIT_UNAVAILABLE");
    assert.equal(auditFailure.nextCalled, false);

    const allowed = await invoke({
      context: {
        user: { id: "test-owner" },
        role: "owner",
        permissions: new Set(["terminador.use"]),
      },
      auditWriter: async (entry) => audits.push(entry),
    });
    assert.equal(allowed.statusCode, 200);
    assert.equal(allowed.nextCalled, true);
    assert.equal(audits.at(-1).action, "terminador.authorization.allowed");
  },
);

test(
  "privileged Code Tools routes are absent from the mounted API router",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const { default: router } = await import("../routes/index.ts");
    const routePaths = [];
    const collectRoutes = (current) => {
      for (const layer of current.stack ?? []) {
        if (layer.route) {
          const paths = Array.isArray(layer.route.path)
            ? layer.route.path
            : [layer.route.path];
          routePaths.push(...paths.map(String));
        } else if (layer.handle?.stack) {
          collectRoutes(layer.handle);
        }
      }
    };
    collectRoutes(router);

    assert.equal(routePaths.some((routePath) => routePath.includes("/tools/")), false);
    assert.ok(routePaths.some((routePath) => routePath.includes("/terminador/apps")));
  },
);
