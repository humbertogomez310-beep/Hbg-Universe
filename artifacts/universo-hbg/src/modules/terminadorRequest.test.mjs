import assert from "node:assert/strict";
import test from "node:test";
import {
  approveTerminadorAuthorization,
  executeTerminadorRequest,
  interpretTerminadorRequest,
  listTerminadorAuthorizations,
  proposeTerminadorAuthorization,
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

test("never treats a browser action as approval for an app state change", async () => {
  const { request, calls } = requestWith({
    "/terminador/apps": { ok: true, data: { applications } },
  });
  const result = await executeTerminadorRequest(
    { type: "set_app_status", target: "Demo App", status: "disabled" },
    request,
  );

  assert.equal(result.status, "blocked");
  assert.match(result.message, /autorización individual server-side/i);
  assert.equal(calls.length, 0);
});

test("blocks app state changes before looking up or submitting a protected target", async () => {
  const { request, calls } = requestWith({});
  const result = await executeTerminadorRequest(
    { type: "set_app_status", target: "HBG Core", status: "disabled" },
    request,
  );
  assert.equal(result.status, "blocked");
  assert.equal(calls.length, 0);
});

test("stops on unapproved changes, malformed responses, and server errors", async () => {
  const missingApp = requestWith({
    "/terminador/apps": { ok: true, data: { applications } },
  });
  assert.equal(
    (await executeTerminadorRequest(
      { type: "set_app_status", target: "unknown", status: "active" },
      missingApp.request,
    )).status,
    "blocked",
  );
  assert.equal(missingApp.calls.length, 0);

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

test("proposal and approval states come only from the Authority response", async () => {
  const calls = [];
  const authorization = {
    id: "proposal-1",
    operation: "apps.set_status",
    resource: "application:demo-app",
    applicationId: "demo-app",
    workspace: "hbg-app-registry",
    parameters: { currentStatus: "active", requestedStatus: "disabled" },
    requestedPermissions: ["terminador.manage"],
    contentHash: null,
    proposalHash: "a".repeat(64),
    reason: "Test",
    state: "pending",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    approvedAt: null,
    revokedAt: null,
    consumedAt: null,
  };
  const request = async (path, init) => {
    calls.push({ path, init });
    const state = path.endsWith("/approve")
      ? { ...authorization, state: "approved", approvedAt: new Date().toISOString() }
      : authorization;
    return { ok: true, data: { success: true, authorization: state } };
  };

  const proposal = await proposeTerminadorAuthorization(
    "demo-app",
    "disabled",
    "Test",
    request,
  );
  assert.equal(proposal.ok, true);
  if (!proposal.ok) return;
  assert.equal(proposal.data.state, "pending");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    applicationId: "demo-app",
    status: "disabled",
    reason: "Test",
  });
  assert.equal("authorized" in JSON.parse(calls[0].init.body), false);

  const approval = await approveTerminadorAuthorization(proposal.data.id, request);
  assert.equal(approval.ok, true);
  if (!approval.ok) return;
  assert.equal(approval.data.state, "approved");
  assert.equal(calls[1].path, "/terminador/authorizations/proposal-1/approve");
  assert.equal(calls[1].init.method, "POST");

  const unavailable = await approveTerminadorAuthorization(
    proposal.data.id,
    async () => ({ ok: false, status: 503, code: "AUDIT_UNAVAILABLE" }),
  );
  assert.equal(unavailable.ok, false);

  const listed = await listTerminadorAuthorizations(async () => ({
    ok: true,
    data: { success: true, authorizations: [authorization] },
  }));
  assert.equal(listed.ok, true);
  if (listed.ok) assert.equal(listed.data[0].state, "pending");
});
