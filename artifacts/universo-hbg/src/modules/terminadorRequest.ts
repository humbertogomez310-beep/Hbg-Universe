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

  if (intent.type === "list_apps") {
    const summary = applications.length
      ? applications.map((app) => `${app.name}: ${app.status}`).join(" · ")
      : "No hay aplicaciones registradas.";
    return { status: "read", action, message: `Registro real del servidor: ${summary}` };
  }

  const target = normalize(intent.target);
  const matches = applications.filter(
    (app) => normalize(app.id) === target || normalize(app.name) === target,
  );
  if (matches.length === 0) {
    return {
      status: "needs_context",
      action,
      message: `No encontré una app con el nombre o ID exacto "${intent.target}" en el registro.`,
    };
  }
  if (matches.length > 1) {
    return {
      status: "needs_context",
      action,
      message: `Hay varias apps que coinciden con "${intent.target}"; indica el ID exacto.`,
    };
  }

  const application = matches[0];
  let statusResult: TerminadorApiResult<{
    success: boolean;
    changed: boolean;
    application?: TerminadorApplication;
  }>;
  try {
    statusResult = await request(
      `/terminador/apps/${encodeURIComponent(application.id)}/status`,
      {
        method: "POST",
        body: JSON.stringify({ status: intent.status }),
      },
    );
  } catch {
    return { status: "failed", action, message: "No se pudo conectar con el servidor." };
  }
  if (!statusResult.ok) return apiFailure(action, statusResult);
  if (statusResult.data.success !== true || typeof statusResult.data.changed !== "boolean") {
    return { status: "failed", action, message: "El servidor no confirmó el cambio de estado." };
  }
  if (!statusResult.data.changed) {
    return {
      status: "read",
      action,
      message: `${application.name} ya figura como ${intent.status} en el registro.`,
    };
  }

  return {
    status: "executed",
    action,
    message: `El registro del servidor ahora marca ${application.name} como ${intent.status}. Esto no inicia ni detiene el proceso de la app.`,
  };
}
