import { parseIntent, type VoiceAction } from "../voice/intentParser";
import {
  interpretTerminadorRequest,
  type TerminadorIntent as AppIntent,
} from "./terminadorRequest";

export type TerminadorOperation =
  | { type: "apps.list" }
  | { type: "apps.set_status"; target: string; status: "active" | "disabled" }
  | { type: "music"; action: VoiceAction }
  | { type: "memory.remember"; key: string; value: string; kind: "preference" | "decision" }
  | { type: "memory.recall"; query: string }
  | { type: "capabilities.list" }
  | { type: "development"; description: string }
  | { type: "unsupported" };

export interface TerminadorInterpretation {
  providerId: string;
  originalText: string;
  normalizedText: string;
  operations: TerminadorOperation[];
  module: "terminador" | "vibra" | "universo" | "unknown";
  entities: Array<{ type: string; value: string }>;
  confidence: number;
  requiresClarification: boolean;
  clarification?: string;
  explanation: string;
}

export interface TerminadorProvider {
  readonly id: string;
  readonly kind: "local" | "device" | "remote";
  isAvailable(): boolean;
  interpret(text: string): Promise<TerminadorInterpretation>;
}

export interface LocalModel {
  isCompatible(): boolean;
  interpret(text: string): Promise<TerminadorInterpretation>;
}

export interface RemoteInterpretationRequest {
  text: string;
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function fromAppIntent(intent: AppIntent): TerminadorOperation | null {
  switch (intent.type) {
    case "list_apps":
      return { type: "apps.list" };
    case "set_app_status":
      return {
        type: "apps.set_status",
        target: intent.target,
        status: intent.status,
      };
    default:
      return null;
  }
}

function interpretSingle(text: string): TerminadorInterpretation {
  const normalizedText = normalize(text);
  const appIntent = interpretTerminadorRequest(text);

  const preference = normalizedText.match(/^recuerda que prefiero (.+)$/);
  if (preference) {
    return {
      providerId: "local-rules",
      originalText: text,
      normalizedText,
      operations: [{
        type: "memory.remember",
        key: "preference.general",
        value: preference[1],
        kind: "preference",
      }],
      module: "terminador",
      entities: [{ type: "memory", value: "preference.general" }],
      confidence: 0.96,
      requiresClarification: false,
      explanation: "Preferencia explícita seleccionada para memoria local persistente.",
    };
  }

  const decision = normalizedText.match(/^recuerda que decidimos (.+)$/);
  if (decision) {
    return {
      providerId: "local-rules",
      originalText: text,
      normalizedText,
      operations: [{
        type: "memory.remember",
        key: `decision.${Date.now()}`,
        value: decision[1],
        kind: "decision",
      }],
      module: "terminador",
      entities: [{ type: "memory", value: "decision" }],
      confidence: 0.94,
      requiresClarification: false,
      explanation: "Decisión explícita seleccionada para memoria local persistente.",
    };
  }

  const recall = normalizedText.match(/^(?:que recuerdas|recuerda|busca en memoria)(?: sobre)?(?: (.+))?$/);
  if (recall) {
    return {
      providerId: "local-rules",
      originalText: text,
      normalizedText,
      operations: [{ type: "memory.recall", query: recall[1] ?? "" }],
      module: "terminador",
      entities: recall[1] ? [{ type: "query", value: recall[1] }] : [],
      confidence: 0.93,
      requiresClarification: false,
      explanation: "Consultaré únicamente las preferencias y decisiones locales guardadas.",
    };
  }

  if (appIntent.type === "needs_app_target") {
    return {
      providerId: "local-rules",
      originalText: text,
      normalizedText,
      operations: [],
      module: "terminador",
      entities: [],
      confidence: 0.96,
      requiresClarification: true,
      clarification: `Indica el nombre o ID exacto de la aplicación que quieres ${
        appIntent.status === "active" ? "activar" : "desactivar"
      }.`,
      explanation: "Reconocí una operación de estado, pero falta la aplicación objetivo.",
    };
  }

  const appOperation = fromAppIntent(appIntent);
  if (appOperation) {
    const target =
      appOperation.type === "apps.set_status" ? appOperation.target : undefined;
    return {
      providerId: "local-rules",
      originalText: text,
      normalizedText,
      operations: [appOperation],
      module: "terminador",
      entities: target ? [{ type: "application", value: target }] : [],
      confidence: 0.98,
      requiresClarification: false,
      explanation: "Solicitud reconocida contra el registro real de aplicaciones.",
    };
  }

  if (/^(que|cuales|cu[aá]les).*(capacidades|herramientas|acciones)( disponibles)?$/.test(normalizedText) ||
      /^(lista|listar|muestra|mostrar|ver) (las )?(capacidades|herramientas|acciones)$/.test(normalizedText)) {
    return {
      providerId: "local-rules",
      originalText: text,
      normalizedText,
      operations: [{ type: "capabilities.list" }],
      module: "terminador",
      entities: [],
      confidence: 0.9,
      requiresClarification: false,
      explanation: "Consultaré el registro de acciones conectadas de HBG Core.",
    };
  }

  if (/\b(escribe|modifica|edita|borra|elimina|crea)\b.*\b(codigo|archivo|fuente|script|comando)\b|\b(ejecuta|corre)\b.*\b(comando|script|terminal)\b/.test(normalizedText)) {
    return {
      providerId: "local-rules",
      originalText: text,
      normalizedText,
      operations: [{ type: "development", description: text }],
      module: "terminador",
      entities: [{ type: "scope", value: "DEVELOPMENT" }],
      confidence: 0.94,
      requiresClarification: false,
      explanation: "Es una operación de desarrollo; no se ejecutará desde el flujo de uso normal.",
    };
  }

  const voiceAction = parseIntent(text);
  const volumeMatch = normalizedText.match(/^volumen\s+(\d{1,3})%?$/);
  const recognizedVoiceAction: VoiceAction =
    voiceAction.type === "UNKNOWN" && volumeMatch
      ? { type: "SET_VOLUME", volume: Number(volumeMatch[1]) }
      : voiceAction;
  if (recognizedVoiceAction.type !== "UNKNOWN") {
    return {
      providerId: "local-rules",
      originalText: text,
      normalizedText,
      operations: [{ type: "music", action: recognizedVoiceAction }],
      module: "vibra",
      entities:
        "query" in recognizedVoiceAction && typeof recognizedVoiceAction.query === "string"
          ? [{ type: "query", value: recognizedVoiceAction.query }]
          : "name" in recognizedVoiceAction
            ? [{ type: "playlist", value: recognizedVoiceAction.name }]
            : [],
      confidence: 0.92,
      requiresClarification: false,
      explanation: "Intención musical reconocida mediante las reglas locales existentes de VIBRA.",
    };
  }

  return {
    providerId: "local-rules",
    originalText: text,
    normalizedText,
    operations: [{ type: "unsupported" }],
    module: "unknown",
    entities: [],
    confidence: 0.2,
    requiresClarification: true,
    clarification: "No reconocí una capacidad conectada. Indica qué quieres hacer y con qué app o módulo.",
    explanation: "No se programó ninguna acción porque no hay una intención reconocida.",
  };
}

export class LocalRulesProvider implements TerminadorProvider {
  readonly id = "local-rules";
  readonly kind = "local" as const;

  isAvailable(): boolean {
    return true;
  }

  async interpret(text: string): Promise<TerminadorInterpretation> {
    const normalizedText = normalize(text);
    const clauses = normalizedText
      .split(/\s+(?:y luego|luego|despues|y despues|y)\s+|;\s*/)
      .map((clause) => clause.trim())
      .filter(Boolean);

    if (clauses.length > 1) {
      const parts = clauses.map(interpretSingle);
      if (parts.every((part) => part.operations[0]?.type !== "unsupported")) {
        const clarification = parts.find((part) => part.requiresClarification);
        return {
          ...parts[0],
          originalText: text,
          normalizedText,
          operations: parts.flatMap((part) => part.operations),
          entities: parts.flatMap((part) => part.entities),
          confidence: Math.min(...parts.map((part) => part.confidence)),
          requiresClarification: Boolean(clarification),
          clarification: clarification?.clarification,
          explanation: "Solicitud compuesta desglosada en operaciones en el orden indicado.",
        };
      }
    }

    return interpretSingle(text);
  }
}

export function createLocalModelProvider(model?: LocalModel): TerminadorProvider {
  return {
    id: "local-model",
    kind: "device",
    isAvailable: () => Boolean(model?.isCompatible()),
    async interpret(text) {
      if (!model?.isCompatible()) {
        throw new Error("No hay un modelo local compatible instalado.");
      }
      const result = await model.interpret(text);
      return { ...result, providerId: "local-model" };
    },
  };
}

export interface RemoteProviderConfig {
  enabled: boolean;
  serverSide: boolean;
  credentialConfigured: boolean;
  request?: (input: RemoteInterpretationRequest) => Promise<TerminadorInterpretation>;
}

export function createRemoteProvider(config: RemoteProviderConfig): TerminadorProvider {
  const available = () =>
    config.enabled &&
    config.serverSide &&
    config.credentialConfigured &&
    typeof config.request === "function";
  return {
    id: "remote",
    kind: "remote",
    isAvailable: available,
    async interpret(text) {
      if (!available() || !config.request) {
        throw new Error("El proveedor remoto está desactivado o no está configurado en el servidor.");
      }
      const result = await config.request({ text });
      return { ...result, providerId: "remote" };
    },
  };
}

export function selectTerminadorProvider(
  providers: TerminadorProvider[],
  preferredId?: string,
): TerminadorProvider {
  const local = providers.find((provider) => provider.kind === "local" && provider.isAvailable());
  if (!local) throw new Error("No hay un proveedor local de Terminador disponible.");
  if (!preferredId || preferredId === local.id) return local;
  return providers.find(
    (provider) => provider.id === preferredId && provider.isAvailable(),
  ) ?? local;
}
