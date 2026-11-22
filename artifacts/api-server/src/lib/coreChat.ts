export interface CoreChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CoreChatReply {
  text: string;
  model: string;
  requestId?: string;
}

export class CoreChatError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "CoreChatError";
  }
}

const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 4_000;
const MAX_TOTAL_LENGTH = 16_000;
const DEFAULT_MODEL = "gpt-6.2-astra";

export function parseCoreChatMessages(value: unknown): CoreChatMessage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) {
    throw new CoreChatError("La conversación debe contener entre 1 y 12 mensajes.", 400, "INVALID_MESSAGES");
  }

  let totalLength = 0;
  const messages: CoreChatMessage[] = [];
  for (const item of value) {
    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item) ||
      Object.keys(item).some((key) => key !== "role" && key !== "content")
    ) {
      throw new CoreChatError("La conversación contiene un mensaje no válido.", 400, "INVALID_MESSAGE");
    }

    const message = item as Record<string, unknown>;
    if (
      (message.role !== "user" && message.role !== "assistant") ||
      typeof message.content !== "string" ||
      message.content.trim().length === 0 ||
      message.content.length > MAX_MESSAGE_LENGTH
    ) {
      throw new CoreChatError("Cada mensaje debe tener rol y contenido válidos.", 400, "INVALID_MESSAGE");
    }

    totalLength += message.content.length;
    if (totalLength > MAX_TOTAL_LENGTH) {
      throw new CoreChatError("La conversación supera el límite de contexto.", 413, "CONTEXT_TOO_LARGE");
    }
    messages.push({ role: message.role, content: message.content });
  }

  if (messages[messages.length - 1]?.role !== "user") {
    throw new CoreChatError("El último mensaje debe ser del usuario.", 400, "INVALID_CONVERSATION_ORDER");
  }
  return messages;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractCoreResponseText(value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (typeof value.output_text === "string" && value.output_text.trim()) {
    return value.output_text.trim();
  }
  if (!Array.isArray(value.output)) return null;

  const parts: string[] = [];
  for (const item of value.output) {
    if (!isRecord(item) || item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (
        isRecord(content) &&
        content.type === "output_text" &&
        typeof content.text === "string" &&
        content.text.trim()
      ) {
        parts.push(content.text.trim());
      }
    }
  }
  return parts.length ? parts.join("\n").trim() : null;
}

export async function generateCoreReply(
  messages: CoreChatMessage[],
  options: {
    apiKey?: string;
    model?: string;
    fetcher?: typeof fetch;
  } = {},
): Promise<CoreChatReply> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new CoreChatError(
      "La IA remota no está configurada. HBG CORE continúa en modo local.",
      503,
      "AI_PROVIDER_NOT_CONFIGURED",
    );
  }

  const model = options.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: [
          "Eres HBG CORE, el asistente conversacional del Universo HBG.",
          "Responde en español, con claridad, criterio y tono directo.",
          "Puedes explicar, analizar, organizar ideas y orientar al usuario.",
          "No afirmes que ejecutaste acciones, cambiaste módulos, archivos, permisos, datos o despliegues.",
          "No solicites ni aceptes credenciales, claves API o secretos.",
          "No puedes ejecutar herramientas, código ni operaciones sensibles; HBG Authority y los módulos locales son los únicos que autorizan y ejecutan acciones.",
          "Si el usuario pide una operación no conectada, explica la limitación sin inventar resultados.",
        ].join(" "),
        input: messages,
        max_output_tokens: 900,
        store: false,
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new CoreChatError("La respuesta de IA tardó demasiado. Inténtalo de nuevo.", 504, "AI_PROVIDER_TIMEOUT");
    }
    throw new CoreChatError("No se pudo conectar con el proveedor de IA.", 502, "AI_PROVIDER_UNAVAILABLE");
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new CoreChatError("El proveedor de IA alcanzó su límite temporal. Inténtalo más tarde.", 503, "AI_PROVIDER_BUSY");
    }
    if (response.status === 401 || response.status === 403) {
      throw new CoreChatError("La credencial del proveedor de IA no es válida o no tiene acceso.", 503, "AI_PROVIDER_CONFIG_ERROR");
    }
    throw new CoreChatError("El proveedor de IA no pudo completar la respuesta.", 502, "AI_PROVIDER_ERROR");
  }

  const body: unknown = await response.json().catch(() => null);
  const text = extractCoreResponseText(body);
  if (!text) {
    throw new CoreChatError("El proveedor de IA devolvió una respuesta vacía o no válida.", 502, "AI_PROVIDER_INVALID_RESPONSE");
  }

  return {
    text,
    model,
    ...(response.headers.get("x-request-id")
      ? { requestId: response.headers.get("x-request-id")! }
      : {}),
  };
}

export function coreAIStatus(
  env: NodeJS.ProcessEnv = process.env,
): { available: boolean; provider: "openai"; model: string } {
  return {
    available: Boolean(env.OPENAI_API_KEY),
    provider: "openai",
    model: env.OPENAI_MODEL || DEFAULT_MODEL,
  };
}
