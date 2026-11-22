import { hbgCore } from "../core/hbgCore.ts";
import type { VoiceAction } from "./intentParser";

const MOOD_LABELS: Record<string, string> = {
  party: "fiesta",
  focus: "enfoque",
  creative: "creativo",
  chill: "chill",
  nostalgia: "nostalgia",
  sad: "triste",
  happy: "feliz",
  normal: "normal",
};

const CORE_MOOD_KEYS: Record<string, string> = {
  party: "energia",
  focus: "enfocado",
  creative: "creativo",
  chill: "relajado",
  nostalgia: "nostalgico",
  sad: "triste",
  happy: "feliz",
  normal: "neutral",
};

function normalizeTrackQuery(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\\s+/g, " ");
}

function selectVerifiedTrack(
  results: unknown[],
  query: string,
): { id: string; title: string } | null {
  const candidates = results.filter(
    (value): value is { id: string; title: string } =>
      typeof value === "object" &&
      value !== null &&
      "id" in value &&
      typeof value.id === "string" &&
      value.id.trim().length > 0 &&
      "title" in value &&
      typeof value.title === "string" &&
      value.title.trim().length > 0,
  );
  if (candidates.length === 1) return candidates[0];
  const normalizedQuery = normalizeTrackQuery(query);
  const exactMatches = candidates.filter(
    (track) => normalizeTrackQuery(track.title) === normalizedQuery,
  );
  return exactMatches.length === 1 ? exactMatches[0] : null;
}

export async function executeVoiceAction(action: VoiceAction): Promise<string> {
  switch (action.type) {
    case "UNKNOWN":
      return "No entendí el comando.";

    case "GREETING":
      return "Hola. Estoy listo para ayudarte a navegar y controlar las funciones locales del Universo HBG.";

    case "CAPABILITIES": {
      const modules = (["universo", "instinto", "vibra"] as const)
        .map((moduleId) => hbgCore.getModuleConfig(moduleId).label);
      const actions = hbgCore.getRegisteredActions();
      return `Módulos disponibles: ${modules.join(", ")}. Acciones conectadas: ${actions.length ? actions.join(", ") : "ninguna en este momento"}.`;
    }

    case "APP_INFO": {
      const module = hbgCore.getModuleConfig(action.module);
      return `${module.label}: ${module.description}.`;
    }

    case "NAVIGATE": {
      hbgCore.setModule(action.module);
      return `Abriendo ${hbgCore.getModuleConfig(action.module).label}.`;
    }

    case "CREATE_SONG":
      hbgCore.setModule("instinto");
      return `Abriendo INSTINTO. La letra "${action.title}" todavía no se ha creado; entra en LETRAS para escribirla y guardarla.`;

    case "BLOCKED_DEVELOPMENT":
      return "Esa operación requiere una sesión de desarrollo autorizada. El modo de uso no puede modificar código, permisos ni despliegues.";

    case "PLAY":
    case "RESUME": {
      const playing = hbgCore.getContext<boolean>("music.isPlaying");
      if (playing) return "Ya está reproduciendo.";
      const res = await hbgCore.dispatchAction("music.play");
      return res.success ? "Reproduciendo." : res.error ?? "No se pudo reproducir.";
    }

    case "PAUSE":
    case "STOP": {
      const playing = hbgCore.getContext<boolean>("music.isPlaying");
      if (playing === false) return "Ya estaba en pausa.";
      const res = await hbgCore.dispatchAction("music.pause");
      return res.success ? "Pausado." : res.error ?? "No se pudo pausar.";
    }

    case "NEXT": {
      const res = await hbgCore.dispatchAction("music.next");
      return res.success ? "Siguiente canción." : res.error ?? "No hay una siguiente canción.";
    }

    case "PREVIOUS": {
      const res = await hbgCore.dispatchAction("music.previous");
      return res.success ? "Canción anterior." : res.error ?? "No hay una canción anterior.";
    }

    case "SET_SHUFFLE": {
      const res = await hbgCore.dispatchAction("music.shuffle", { enabled: action.value });
      return res.success
        ? `Modo aleatorio ${action.value ? "activado" : "desactivado"}.`
        : res.error ?? "No se pudo cambiar el modo aleatorio.";
    }

    case "SET_REPEAT": {
      const mode = action.value ? "all" : "off";
      const res = await hbgCore.dispatchAction("music.repeat", { mode });
      return res.success
        ? `Repetición ${action.value ? "activada para toda la cola" : "desactivada"}.`
        : res.error ?? "No se pudo cambiar la repetición.";
    }

    case "SET_MOOD": {
      const res = await hbgCore.dispatchAction("music.mood", { mode: action.mood });
      if (res.success) {
        const coreMood = CORE_MOOD_KEYS[action.mood];
        if (coreMood) hbgCore.remember("core.mood", coreMood);
        const label = MOOD_LABELS[action.mood] ?? action.mood;
        return `Modo ${label} activado.`;
      }
      return res.error ?? "No se pudo cambiar el modo de ánimo.";
    }

    case "SET_DIRECTION": {
      const res = await hbgCore.dispatchAction("music.direct", { text: action.text });
      return res.success
        ? `Objetivo musical actualizado: ${(res.data as { goal?: string } | undefined)?.goal ?? action.text}.`
        : res.error ?? "No se pudo actualizar el objetivo musical.";
    }

    case "SET_AUTO_DJ": {
      const res = await hbgCore.dispatchAction("music.autoDj", { enabled: action.enabled });
      return res.success
        ? `Auto DJ ${action.enabled ? "activado" : "desactivado"}.`
        : res.error ?? "No se pudo cambiar Auto DJ.";
    }

    case "SET_PARTY": {
      const res = await hbgCore.dispatchAction("music.party", { enabled: action.enabled });
      return res.success
        ? `Modo Fiesta PRO ${action.enabled ? "activado" : "desactivado"}.`
        : res.error ?? "No se pudo cambiar Modo Fiesta PRO.";
    }

    case "NOW_PLAYING": {
      const track = hbgCore.getContext<{ title?: string; artist?: string }>("music.currentTrack");
      if (!track) return "No hay una canción seleccionada en VIBRA.";
      const title = `${track.title ?? "una canción"}${track.artist ? ` de ${track.artist}` : ""}`;
      return hbgCore.getContext<boolean>("music.isPlaying")
        ? `Está sonando ${title}.`
        : `${title} está seleccionada, pero la reproducción está en pausa.`;
    }

    case "SET_VOLUME": {
      const res = await hbgCore.dispatchAction("music.volume", { volume: action.volume });
      return res.success
        ? `Volumen ajustado al ${action.volume}%.`
        : res.error ?? "No se pudo cambiar el volumen.";
    }

    case "PLAYLIST_CREATE": {
      const res = await hbgCore.dispatchAction("music.playlist", {
        mode: "create",
        name: action.name,
        ...(action.query ? { query: action.query } : {}),
      });
      if (!res.success) return res.error ?? "No se pudo crear la playlist.";
      const playlist = (res.data as { playlist?: { trackIds?: string[] } } | undefined)?.playlist;
      return `Playlist "${action.name}" creada con ${playlist?.trackIds?.length ?? 0} canciones reales de la biblioteca.`;
    }

    case "PLAYLIST_ADD":
    case "PLAYLIST_REMOVE": {
      const res = await hbgCore.dispatchAction("music.playlist", {
        mode: action.type === "PLAYLIST_ADD" ? "add" : "remove",
        name: action.name,
      });
      return res.success
        ? `Canción ${action.type === "PLAYLIST_ADD" ? "agregada a" : "quitada de"} "${action.name}".`
        : res.error ?? "No se pudo modificar la playlist.";
    }

    case "PLAYLIST_PLAY": {
      const res = await hbgCore.dispatchAction("music.playlist", { mode: "play", name: action.name });
      return res.success
        ? `Reproduciendo la playlist "${action.name}".`
        : res.error ?? `No se pudo reproducir "${action.name}".`;
    }

    case "PLAY_TRACK": {
      const registered = hbgCore.getRegisteredActions();
      if (!registered.includes("music.search") || !registered.includes("music.playTrack")) {
        hbgCore.setModule("vibra");
      }
      const searchRes = await hbgCore.dispatchAction(
        "music.search",
        { query: action.query },
        { timeoutMs: 5_000 },
      );
      const results = (searchRes.data as { results?: unknown[] } | undefined)?.results ?? [];
      if (!searchRes.success || results.length === 0) {
        return `No encontré ninguna canción que coincida con ${action.query}.`;
      }
      const selected = selectVerifiedTrack(results, action.query);
      if (!selected) {
        return "Encontré varias coincidencias o resultados incompletos. Indica el título exacto de la canción para evitar reproducir una pista equivocada.";
      }
      const playRes = await hbgCore.dispatchAction(
        "music.playTrack",
        { id: selected.id },
        { timeoutMs: 5_000 },
      );
      if (playRes.success) {
        const track = (playRes.data as { track?: { title?: string } } | undefined)?.track;
        return `Reproduciendo ${track?.title ?? selected.title}.`;
      }
      return playRes.error ?? "No se pudo reproducir esa canción.";
    }

    default:
      return "No entendí el comando.";
  }
}