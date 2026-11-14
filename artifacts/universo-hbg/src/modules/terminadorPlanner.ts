import type { VoiceAction } from "../voice/intentParser";
import type {
  TerminadorInterpretation,
  TerminadorOperation,
} from "./terminadorProviders";

export type TerminadorTaskState =
  | "pending"
  | "planned"
  | "authorized"
  | "executing"
  | "completed"
  | "failed"
  | "blocked"
  | "cancelled";

export type TerminadorTaskScope = "local" | "authority" | "development" | "remote";

export interface TerminadorTask {
  id: string;
  idempotencyKey: string;
  title: string;
  operation: TerminadorOperation | { type: "music.search_for_track"; query: string };
  scope: TerminadorTaskScope;
  requiredPermission?: "terminador.use" | "terminador.manage" | "universe.code.modify";
  dependsOn: string[];
  state: TerminadorTaskState;
  reason?: string;
  output?: unknown;
}

export interface TerminadorPlan {
  id: string;
  providerId: string;
  interpretation: TerminadorInterpretation;
  tasks: TerminadorTask[];
  state: TerminadorTaskState;
}

function musicActionName(action: VoiceAction): string {
  switch (action.type) {
    case "PLAY":
    case "RESUME": return "music.play";
    case "PAUSE":
    case "STOP": return "music.pause";
    case "NEXT": return "music.next";
    case "PREVIOUS": return "music.previous";
    case "SET_MOOD": return "music.mood";
    case "SET_DIRECTION": return "music.direct";
    case "SET_AUTO_DJ": return "music.autoDj";
    case "SET_PARTY": return "music.party";
    case "SET_VOLUME": return "music.volume";
    case "PLAYLIST_CREATE":
    case "PLAYLIST_ADD":
    case "PLAYLIST_REMOVE":
    case "PLAYLIST_PLAY": return "music.playlist";
    case "PLAY_TRACK": return "music.search";
    case "NOW_PLAYING": return "music.currentTrack";
    default: return "";
  }
}

function taskFor(
  planId: string,
  sequence: number,
  operation: TerminadorOperation,
): TerminadorTask {
  const id = `${planId}-${sequence}`;
  const idempotencyKey = JSON.stringify(operation);
  if (operation.type === "apps.list") {
    return {
      id,
      idempotencyKey,
      title: "Consultar el registro de aplicaciones",
      operation,
      scope: "authority",
      requiredPermission: "terminador.use",
      dependsOn: [],
      state: "planned",
    };
  }
  if (operation.type === "apps.set_status") {
    return {
      id,
      idempotencyKey,
      title: `Solicitar marcar ${operation.target} como ${operation.status}`,
      operation,
      scope: "authority",
      requiredPermission: "terminador.manage",
      dependsOn: [],
      state: "blocked",
      reason: "No existe autorización individual server-side para esta operación; no se ejecutará.",
    };
  }
  if (operation.type === "development") {
    return {
      id,
      idempotencyKey,
      title: "Operación de desarrollo",
      operation,
      scope: "development",
      requiredPermission: "universe.code.modify",
      dependsOn: [],
      state: "blocked",
      reason: "El flujo de desarrollo está separado y requiere sesión y permisos verificados por el servidor.",
    };
  }
  if (operation.type === "capabilities.list") {
    return {
      id,
      idempotencyKey,
      title: "Consultar capacidades registradas en HBG Core",
      operation,
      scope: "local",
      dependsOn: [],
      state: "planned",
    };
  }
  if (operation.type === "memory.remember" || operation.type === "memory.recall") {
    return {
      id,
      idempotencyKey,
      title: operation.type === "memory.remember"
        ? `Guardar ${operation.kind === "preference" ? "preferencia" : "decisión"} local`
        : "Consultar memoria local pertinente",
      operation,
      scope: "local",
      dependsOn: [],
      state: "planned",
    };
  }
  if (operation.type === "music") {
    return {
      id,
      idempotencyKey,
      title: `Ejecutar capacidad ${musicActionName(operation.action) || operation.action.type}`,
      operation,
      scope: "local",
      requiredPermission: "terminador.use",
      dependsOn: [],
      state: "planned",
    };
  }
  return {
    id,
    idempotencyKey,
    title: "Operación no disponible",
    operation,
    scope: "local",
    dependsOn: [],
    state: "blocked",
    reason: "No existe una capacidad conectada para esta solicitud.",
  };
}

export function createTerminadorPlan(
  interpretation: TerminadorInterpretation,
  planId = `terminador-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
): TerminadorPlan {
  const tasks: TerminadorTask[] = [];
  for (const operation of interpretation.operations) {
    if (operation.type === "music" && operation.action.type === "PLAY_TRACK") {
      const searchAction: VoiceAction = operation.action;
      const searchTask = taskFor(planId, tasks.length + 1, {
        type: "music",
        action: { type: "UNKNOWN", raw: searchAction.query },
      });
      searchTask.title = `Buscar "${searchAction.query}" en la biblioteca local`;
      searchTask.operation = { type: "music.search_for_track", query: searchAction.query };
      tasks.push(searchTask);

      const playTask = taskFor(planId, tasks.length + 1, {
        type: "music",
        action: searchAction,
      });
      playTask.title = `Reproducir el resultado verificado`;
      playTask.dependsOn = [searchTask.id];
      tasks.push(playTask);
      continue;
    }
    tasks.push(taskFor(planId, tasks.length + 1, operation));
  }

  for (let index = 0; index < tasks.length; index += 1) {
    if (index > 0 && tasks[index].state !== "blocked" && tasks[index].dependsOn.length === 0) {
      tasks[index].dependsOn = [tasks[index - 1].id];
    }
  }

  const state: TerminadorTaskState = interpretation.requiresClarification
    ? "pending"
    : tasks.some((task) => task.state === "blocked")
      ? "blocked"
      : "planned";
  return {
    id: planId,
    providerId: interpretation.providerId,
    interpretation,
    tasks,
    state,
  };
}

export function validateTerminadorPlan(plan: TerminadorPlan): string[] {
  const errors: string[] = [];
  const ids = new Set(plan.tasks.map((task) => task.id));
  if (ids.size !== plan.tasks.length) errors.push("El plan contiene IDs de tarea duplicados.");
  for (const task of plan.tasks) {
    for (const dependency of task.dependsOn) {
      if (!ids.has(dependency)) errors.push(`Dependencia desconocida: ${dependency}.`);
      if (dependency === task.id) errors.push(`La tarea ${task.id} depende de sí misma.`);
    }
  }
  return errors;
}

export interface PlanExecutionOptions {
  signal?: AbortSignal;
}

export class TerminadorTaskBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TerminadorTaskBlockedError";
  }
}

export async function executeTerminadorPlan<T>(
  plan: TerminadorPlan,
  executeTask: (task: TerminadorTask, priorResults: ReadonlyMap<string, T>) => Promise<T>,
  options: PlanExecutionOptions = {},
): Promise<TerminadorPlan> {
  const validationErrors = validateTerminadorPlan(plan);
  if (validationErrors.length) {
    return {
      ...plan,
      state: "failed",
      tasks: plan.tasks.map((task) => ({ ...task, state: "failed", reason: validationErrors.join(" ") })),
    };
  }
  if (plan.interpretation.requiresClarification) return { ...plan, state: "pending" };

  const results = new Map<string, T>();
  const states = new Map(plan.tasks.map((task) => [task.id, task.state]));
  const updatedTasks: TerminadorTask[] = [];

  for (const task of plan.tasks) {
    if (options.signal?.aborted) {
      updatedTasks.push({ ...task, state: "cancelled", reason: "Ejecución cancelada." });
      states.set(task.id, "cancelled");
      continue;
    }
    if (task.state === "blocked") {
      updatedTasks.push(task);
      continue;
    }
    const failedDependency = task.dependsOn.find((id) => states.get(id) !== "completed");
    if (failedDependency) {
      updatedTasks.push({
        ...task,
        state: "blocked",
        reason: `Dependencia no completada: ${failedDependency}.`,
      });
      states.set(task.id, "blocked");
      continue;
    }
    try {
      const result = await executeTask({ ...task, state: "executing" }, results);
      results.set(task.id, result);
      states.set(task.id, "completed");
      updatedTasks.push({ ...task, state: "completed", output: result });
    } catch (error) {
      const state = error instanceof TerminadorTaskBlockedError ? "blocked" : "failed";
      states.set(task.id, state);
      updatedTasks.push({
        ...task,
        state,
        reason: error instanceof Error ? error.message : "La tarea falló.",
      });
    }
  }

  const state: TerminadorTaskState = updatedTasks.some((task) => task.state === "failed")
    ? "failed"
    : updatedTasks.some((task) => task.state === "blocked" || task.state === "cancelled")
      ? "blocked"
      : "completed";
  return { ...plan, state, tasks: updatedTasks };
}

export function musicActionNameForPlan(action: VoiceAction): string {
  return musicActionName(action);
}
