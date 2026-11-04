import assert from "node:assert/strict";
import test from "node:test";
import {
  executeTerminadorRequest,
  interpretTerminadorRequest,
} from "./terminadorRequest.ts";

const applications = [
  { id: "hbg-core", name: "HBG Core", status: "active" },
  { id: "demo-app", name: "Demo App", status: "active" },
];

function requestWith(responses) {
  const calls = [];
  return {
    calls,
    request: async (path, init) => {
      calls.push({ path, init });
      const response = responses[path];
      return typeof response === "function" ? response(path, init) : response;
    },
  };
}

test("interprets app listing and state-change requests and asks for a missing target", () => {
  assert.deepEqual(interpretTerminadorRequest("Lista las apps del ecosistema"), {
    type: "list_apps",
  });
  assert.deepEqual(interpretTerminadorRequest("Apaga la aplicación Demo App"), {
    type: "set_app_status",
    target: "demo app",
    status: "disabled",
  });
  assert.deepEqual(interpretTerminadorRequest("Activa la app"), {
    type: "needs_app_target",
    status: "active",
  });
  assert.deepEqual(interpretTerminadorRequest("busca Bad Bunny"), {
    type: "not_app_request",
  });
});

test("reads the real application registry without claiming an execution", async () => {
  const { request, calls } = requestWith({
    "/terminador/apps": { ok: true, data: { applications } },
  });
  const result = await executeTerminadorRequest({ type: "list_apps" }, request);

  assert.equal(result.status, "read");
  assert.match(result.message, /HBG Core: active/);
  assert.equal(calls.length, 1);
});

test("does not execute when HBG Authority denies the state change", async () => {
  const { request, calls } = requestWith({
    "/terminador/apps": { ok: true, data: { applications } },
    "/terminador/apps/demo-app/status": { ok: false, status: 403, code: "FORBIDDEN" },
  });
  const result = await executeTerminadorRequest(
    { type: "set_app_status", target: "Demo App", status: "disabled" },
    request,
  );

  assert.equal(result.status, "denied");
  assert.match(result.message, /HBG Authority no autorizó/);
  assert.equal(calls.length, 2);
});

test("still checks manage permission when the requested registry state is already set", async () => {
  const { request, calls } = requestWith({
    "/terminador/apps": {
      ok: true,
      data: { applications: [{ ...applications[1], status: "disabled" }] },
    },
    "/terminador/apps/demo-app/status": { ok: false, status: 403, code: "FORBIDDEN" },
  });
  const result = await executeTerminadorRequest(
    { type: "set_app_status", target: "Demo App", status: "disabled" },
    request,
  );

  assert.equal(result.status, "denied");
  assert.equal(calls.length, 2);
});

test("uses the authorized server endpoint and reports its actual registry result", async () => {
  const { request, calls } = requestWith({
    "/terminador/apps": { ok: true, data: { applications } },
    "/terminador/apps/demo-app/status": {
      ok: true,
      data: { success: true, changed: true },
    },
  });
  const result = await executeTerminadorRequest(
    { type: "set_app_status", target: "Demo App", status: "disabled" },
    request,
  );

  assert.equal(result.status, "executed");
  assert.match(result.message, /no inicia ni detiene el proceso/);
  assert.deepEqual(JSON.parse(calls[1].init.body), { status: "disabled" });
});

test("stops on missing context, protected apps, malformed responses, and server errors", async () => {
  const missingApp = requestWith({
    "/terminador/apps": { ok: true, data: { applications } },
  });
  assert.equal(
    (await executeTerminadorRequest(
      { type: "set_app_status", target: "unknown", status: "active" },
      missingApp.request,
    )).status,
    "needs_context",
  );
  assert.equal(missingApp.calls.length, 1);

  const protectedApp = requestWith({
    "/terminador/apps": { ok: true, data: { applications } },
    "/terminador/apps/hbg-core/status": {
      ok: false,
      status: 409,
      code: "APP_PROTECTED",
    },
  });
  assert.equal(
    (await executeTerminadorRequest(
      { type: "set_app_status", target: "hbg-core", status: "disabled" },
      protectedApp.request,
    )).status,
    "blocked",
  );

  const malformed = requestWith({
    "/terminador/apps": { ok: true, data: { applications: "not-an-array" } },
  });
  assert.equal(
    (await executeTerminadorRequest({ type: "list_apps" }, malformed.request)).status,
    "failed",
  );

  const unavailable = requestWith({
    "/terminador/apps": { ok: false, status: 503, error: "Registro no disponible." },
  });
  assert.equal(
    (await executeTerminadorRequest({ type: "list_apps" }, unavailable.request)).status,
    "failed",
  );

  const networkError = await executeTerminadorRequest(
    { type: "list_apps" },
    async () => {
      throw new Error("offline");
    },
  );
  assert.equal(networkError.status, "failed");
  assert.match(networkError.message, /conectar con el servidor/);
});
