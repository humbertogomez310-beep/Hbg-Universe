import { hbgCore } from "../core/hbgCore";
import type { HBGActionName, HBGActionResult } from "../core/types";
import type { VoiceAction } from "../voice/intentParser";
import {
  executeTerminadorRequest,
  type TerminadorApiRequest,
} from "./terminadorRequest";
import {
  executeTerminadorPlan,
  musicActionNameForPlan,
  TerminadorTaskBlockedError,
  type TerminadorPlan,
  type TerminadorTask,
} from "./terminadorPlanner";
import { TerminadorMemory } from "./terminadorMemory";

type TerminadorCore = Pick<
  typeof hbgCore,
  "dispatchAction" | "getRegisteredActions" | "setModule" | "getContext"
>;

function requestForVoiceAction(action: VoiceAction): {
  name: HBGActionName;
  payload?: Record<string, unknown>;
} {
  switch (action.type) {
    case "PLAY":
    case "RESUME":
      return { name: "music.play" };
    case "PAUSE":
    case "STOP":
      return { name: "music.pause" };
    case "NEXT":
      return { name: "music.next" };
    case "PREVIOUS":
      return { name: "music.previous" };
    case "SET_MOOD":
      return { name: "music.mood", payload: { mode: action.mood } };
    case "SET_DIRECTION":
      return { name: "music.direct", payload: { text: action.text } };
    case "SET_AUTO_DJ":
      return { name: "music.autoDj", payload: { enabled: action.enabled } };
    case "SET_PARTY":
      return { name: "music.party", payload: { enabled: action.enabled } };
    case "SET_VOLUME":
      if (action.volume < 0 || action.volume > 100) {
        throw new TerminadorTaskBlockedError("El volumen debe estar entre 0 y 100.");
      }
      return { name: "music.volume", payload: { volume: action.volume } };
    case "PLAYLIST_CREATE":
      return {
        name: "music.playlist",
        payload: { mode: "create", name: action.name, ...(action.query ? { query: action.query } : {}) },
      };
    case "PLAYLIST_ADD":
    case "PLAYLIST_REMOVE":
    case "PLAYLIST_PLAY":
      return {
        name: "music.playlist",
        payload: {
          mode: action.type === "PLAYLIST_ADD" ? "add" : action.type === "PLAYLIST_REMOVE" ? "remove" : "play",
          name: action.name,
        },
      };
    case "PLAY_TRACK":
      return { name: "music.playTrack", payload: { index: 1 } };
    case "SET_SHUFFLE":
    case "SET_REPEAT":
      throw new TerminadorTaskBlockedError("Esta capacidad aún no está conectada en VIBRA.");
    case "UNKNOWN":
      throw new TerminadorTaskBlockedError("La intención musical no es ejecutable.");
    case "NOW_PLAYING":
      throw new TerminadorTaskBlockedError("La consulta del estado musical no requiere un despacho.");
  }
}

async function dispatchMusicAction(
  action: VoiceAction,
  core: TerminadorCore,
): Promise<HBGActionResult> {
  const request = requestForVoiceAction(action);
  if (!core.getRegisteredActions().includes(request.name)) core.setModule("vibra");
  return core.dispatchAction(request.name, request.payload, { timeoutMs: 5_000 });
}

function assertSuccessful(result: HBGActionResult, fallback: string): HBGActionResult {
  if (!result.success) throw new Error(result.error ?? fallback);
  return result;
}

export async function executeTerminadorPlanWithHBG(
  plan: TerminadorPlan,
  options: {
    request: TerminadorApiRequest;
    signal?: AbortSignal;
    core?: TerminadorCore;
    memory?: TerminadorMemory;
  },
): Promise<TerminadorPlan> {
  const core = options.core ?? hbgCore;
  return executeTerminadorPlan<unknown>(
    plan,
    async (task: TerminadorTask, priorResults) => {
      if (task.operation.type === "apps.list" || task.operation.type === "apps.set_status") {
        const intent = task.operation.type === "apps.list"
          ? { type: "list_apps" as const }
          : {
              type: "set_app_status" as const,
              target: task.operation.target,
              status: task.operation.status,
            };
        const outcome = await executeTerminadorRequest(intent, options.request);
        if (outcome.status === "denied" || outcome.status === "blocked") {
          throw new TerminadorTaskBlockedError(outcome.message);
        }
        if (outcome.status === "needs_context") {
          throw new TerminadorTaskBlockedError(outcome.message);
        }
        if (outcome.status === "failed") throw new Error(outcome.message);
        return outcome;
      }

      if (task.operation.type === "capabilities.list") {
        return core.getRegisteredActions();
      }
      if (task.operation.type === "memory.remember") {
        const memory = options.memory ?? new TerminadorMemory();
        return memory.remember(task.operation.key, task.operation.value, {
          kind: task.operation.kind,
          scope: "persistent",
        });
      }
      if (task.operation.type === "memory.recall") {
        const memory = options.memory ?? new TerminadorMemory();
        return task.operation.query
          ? memory.recallRelevant(task.operation.query)
          : memory.list();
      }
      if (task.operation.type === "development") {
        throw new TerminadorTaskBlockedError(
          "Las acciones de desarrollo no se ejecutan desde TERMINADOR de uso normal. Inicia una sesión de desarrollo autorizada.",
        );
      }
      if (task.operation.type === "music.search_for_track") {
        const search = await core.dispatchAction(
          "music.search",
          { query: task.operation.query },
          { timeoutMs: 5_000 },
        );
        assertSuccessful(search, "La búsqueda local no pudo completarse.");
        const results = (search.data as { results?: unknown[] } | undefined)?.results;
        if (!Array.isArray(results) || results.length === 0) {
          throw new TerminadorTaskBlockedError("No se encontró una canción para reproducir.");
        }
        return { search, firstResult: results[0] };
      }
      if (task.operation.type === "music") {
        if (task.operation.action.type === "NOW_PLAYING") {
          const track = core.getContext<{ title?: string; artist?: string }>("music.currentTrack");
          if (!track) throw new TerminadorTaskBlockedError("No hay una canción seleccionada en VIBRA.");
          return {
            track,
            playing: core.getContext<boolean>("music.isPlaying") ?? false,
          };
        }
        if (task.operation.action.type === "PLAY_TRACK") {
          const prior = task.dependsOn.map((id) => priorResults.get(id)).find(Boolean);
          if (!prior) throw new TerminadorTaskBlockedError("No hay un resultado de búsqueda verificado.");
          const play = await dispatchMusicAction(task.operation.action, core);
          assertSuccessful(play, "No se pudo reproducir el resultado encontrado.");
          return play;
        }
        const result = await dispatchMusicAction(task.operation.action, core);
        return assertSuccessful(result, "La capacidad de HBG Core no confirmó la operación.");
      }
      throw new TerminadorTaskBlockedError("No existe un ejecutor para esta operación.");
    },
    {
      signal: options.signal,
    },
  );
}

export function getMusicActionForTask(task: TerminadorTask): string | undefined {
  return task.operation.type === "music"
    ? musicActionNameForPlan(task.operation.action)
    : undefined;
}
