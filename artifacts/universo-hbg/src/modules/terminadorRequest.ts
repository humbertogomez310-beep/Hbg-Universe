export interface TerminadorApplication {
  id: string;
  name: string;
  status: string;
}

export type TerminadorIntent =
  | { type: "list_apps" }
  | { type: "set_app_status"; target: string; status: "active" | "disabled" }
  | { type: "needs_app_target"; status: "active" | "disabled" }
  | { type: "not_app_request" };

export type TerminadorApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code?: string; error?: string };

export type TerminadorApiRequest = <T>(
  path: string,
  init?: RequestInit,
) => Promise<TerminadorApiResult<T>>;

export type TerminadorAuthorizationState =
  | "pending"
  | "approved"
  | "denied"
  | "revoked"
  | "expired"
  | "consumed";

export interface TerminadorAuthorization {
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
  state: TerminadorAuthorizationState;
  createdAt: string;
  expiresAt: string;
  approvedAt: string | null;
  revokedAt: string | null;
  consumedAt: string | null;
}

export async function requestTerminadorApi<T>(
  path: string,
  init?: RequestInit,
): Promise<TerminadorApiResult<T>> {
  try {
    const headers = new Headers(init?.headers);
    headers.set("Content-Type", "application/json");
    const response = await fetch(`/api${path}`, {
      credentials: "include",
      ...init,
      headers,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const errorBody =
        typeof body === "object" && body !== null
          ? (body as Record<string, unknown>)
          : {};
      return {
        ok: false,
        status: response.status,
        code: typeof errorBody.code === "string" ? errorBody.code : undefined,
        error: typeof errorBody.error === "string" ? errorBody.error : undefined,
      };
    }
    if (typeof body !== "object" || body === null) {
      return { ok: false, status: response.status, code: "INVALID_RESPONSE" };
    }
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, status: 0 };
  }
}

function authorizationFrom(value: unknown): TerminadorAuthorization | null {
  if (typeof value !== "object" || value === null || !("authorization" in value)) {
    return null;
  }
  const authorization = (value as { authorization?: unknown }).authorization;
  if (
    typeof authorization !== "object" ||
    authorization === null ||
    !("id" in authorization) ||
    typeof authorization.id !== "string" ||
    !("state" in authorization) ||
    !["pending", "approved", "denied", "revoked", "expired", "consumed"].includes(
      String(authorization.state),
    )
  ) {
    return null;
  }
  return authorization as TerminadorAuthorization;
}

function authorizationsFrom(value: unknown): TerminadorAuthorization[] | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("authorizations" in value) ||
    !Array.isArray(value.authorizations)
  ) {
    return null;
  }
  const authorizations: TerminadorAuthorization[] = [];
  for (const item of value.authorizations) {
    const authorization = authorizationFrom({ authorization: item });
    if (!authorization) return null;
    authorizations.push(authorization);
  }
  return authorizations;
}

export async function listTerminadorAuthorizations(
  request: TerminadorApiRequest = requestTerminadorApi,
): Promise<TerminadorApiResult<TerminadorAuthorization[]>> {
  try {
    const result = await request<unknown>("/terminador/authorizations");
    if (!result.ok) return result;
    const authorizations = authorizationsFrom(result.data);
    return authorizations
      ? { ok: true, data: authorizations }
      : { ok: false, status: 502, code: "INVALID_RESPONSE" };
  } catch {
    return { ok: false, status: 0, code: "NETWORK_ERROR" };
  }
}

async function authorizationRequest(
  path: string,
  init: RequestInit,
  request: TerminadorApiRequest,
): Promise<TerminadorApiResult<TerminadorAuthorization>> {
  try {
    const result = await request<unknown>(path, init);
    if (!result.ok) return result;
    const authorization = authorizationFrom(result.data);
    return authorization
      ? { ok: true, data: authorization }
      : { ok: false, status: 502, code: "INVALID_RESPONSE" };
  } catch {
    return { ok: false, status: 0, code: "NETWORK_ERROR" };
  }
}

export function proposeTerminadorAuthorization(
  applicationId: string,
  status: "active" | "disabled",
  reason: string,
  request: TerminadorApiRequest = requestTerminadorApi,
): Promise<TerminadorApiResult<TerminadorAuthorization>> {
  return authorizationRequest(
    "/terminador/authorizations",
    {
      method: "POST",
      body: JSON.stringify({ applicationId, status, reason }),
    },
    request,
  );
}

export function approveTerminadorAuthorization(
  id: string,
  request: TerminadorApiRequest = requestTerminadorApi,
): Promise<TerminadorApiResult<TerminadorAuthorization>> {
  return authorizationRequest(
    `/terminador/authorizations/${encodeURIComponent(id)}/approve`,
    { method: "POST" },
    request,
  );
}

export function revokeTerminadorAuthorization(
  id: string,
  request: TerminadorApiRequest = requestTerminadorApi,
): Promise<TerminadorApiResult<TerminadorAuthorization>> {
  return authorizationRequest(
    `/terminador/authorizations/${encodeURIComponent(id)}/revoke`,
    { method: "POST" },
    request,
  );
}

export function denyTerminadorAuthorization(
  id: string,
  request: TerminadorApiRequest = requestTerminadorApi,
): Promise<TerminadorApiResult<TerminadorAuthorization>> {
  return authorizationRequest(
    `/terminador/authorizations/${encodeURIComponent(id)}/deny`,
    { method: "POST" },
    request,
  );
}

export function refreshTerminadorAuthorization(
  id: string,
  request: TerminadorApiRequest = requestTerminadorApi,
): Promise<TerminadorApiResult<TerminadorAuthorization>> {
  return authorizationRequest(
    `/terminador/authorizations/${encodeURIComponent(id)}`,
    { method: "GET" },
    request,
  );
}

export type TerminadorRequestResult = {
  status: "read" | "executed" | "denied" | "blocked" | "needs_context" | "failed";
  message: string;
  action: string;
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function interpretTerminadorRequest(text: string): TerminadorIntent {
  const command = normalize(text).replace(/\s+/g, " ");
  if (/^(?:lista|listar|muestra|mostrar|ver)\s+(?:las\s+)?(?:apps|aplicaciones)(?:\s+del\s+ecosistema)?$/.test(command)) {
    return { type: "list_apps" };
  }

  const statusCommand = command.match(
    /^(apaga|desactiva|deshabilita|enciende|activa|habilita)\s+(?:la\s+)?(?:app|aplicacion)(?:\s+(.+))?$/,
  );
  if (!statusCommand) return { type: "not_app_request" };

  const status = ["apaga", "desactiva", "deshabilita"].includes(statusCommand[1])
    ? "disabled"
    : "active";
  const target = statusCommand[2]?.trim();
  return target
    ? { type: "set_app_status", target, status }
    : { type: "needs_app_target", status };
}

function permissionMessage(status: number): string {
  return status === 401
    ? "Operación detenida: hace falta una sesión válida."
    : "Operación detenida: HBG Authority no autorizó esta acción.";
}

function apiFailure(
  action: string,
  result: { status: number; code?: string; error?: string },
): TerminadorRequestResult {
  if (result.status === 401 || result.status === 403) {
    return { status: "denied", action, message: permissionMessage(result.status) };
  }
  if (result.code === "APP_PROTECTED") {
    return {
      status: "blocked",
      action,
      message: "Operación detenida: HBG Authority protege esa aplicación.",
    };
  }
  return {
    status: "failed",
    action,
    message: result.error ?? "No se pudo completar la solicitud con el servidor.",
  };
}

function applicationsFrom(value: unknown): TerminadorApplication[] | null {
  if (typeof value !== "object" || value === null || !("applications" in value)) {
    return null;
  }
  const applications = (value as { applications?: unknown }).applications;
  if (!Array.isArray(applications)) return null;
  if (
    !applications.every(
      (application) =>
        typeof application === "object" &&
        application !== null &&
        "id" in application &&
        typeof application.id === "string" &&
        "name" in application &&
        typeof application.name === "string" &&
        "status" in application &&
        typeof application.status === "string",
    )
  ) {
    return null;
  }
  return applications as TerminadorApplication[];
}

export async function executeTerminadorRequest(
  intent: Exclude<TerminadorIntent, { type: "not_app_request" | "needs_app_target" }>,
  request: TerminadorApiRequest,
): Promise<TerminadorRequestResult> {
  const action = intent.type === "list_apps" ? "terminador.apps.list" : "terminador.app.status";

  if (intent.type === "set_app_status") {
    return {
      status: "blocked",
      action,
      message: "Cambio bloqueado: falta una autorización individual server-side de HBG Authority.",
    };
  }

  let appsResult: TerminadorApiResult<{ applications: TerminadorApplication[] }>;
  try {
    appsResult = await request<{ applications: TerminadorApplication[] }>("/terminador/apps");
  } catch {
    return { status: "failed", action, message: "No se pudo conectar con el servidor." };
  }
  if (!appsResult.ok) return apiFailure(action, appsResult);

  const applications = applicationsFrom(appsResult.data);
  if (!applications) {
    return { status: "failed", action, message: "El servidor devolvió un registro de apps no válido." };
  }

  const summary = applications.length
    ? applications.map((app) => `${app.name}: ${app.status}`).join(" · ")
    : "No hay aplicaciones registradas.";
  return { status: "read", action, message: `Registro real del servidor: ${summary}` };
}
