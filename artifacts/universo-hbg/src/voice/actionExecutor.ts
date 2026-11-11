import { hbgCore } from "../core/hbgCore";
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

export async function executeVoiceAction(action: VoiceAction): Promise<string> {
  switch (action.type) {
    case "UNKNOWN":
      return "No entendí el comando.";

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

    case "SET_SHUFFLE":
      return "El modo aleatorio no está disponible todavía en VIBRA PRO.";

    case "SET_REPEAT":
      return "La repetición no está disponible todavía en VIBRA PRO.";

    case "SET_MOOD": {
      const res = await hbgCore.dispatchAction("music.mood", { mode: action.mood });
      if (res.success) {
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
      const searchRes = await hbgCore.dispatchAction("music.search", { query: action.query });
      const results = (searchRes.data as { results?: unknown[] } | undefined)?.results ?? [];
      if (!searchRes.success || results.length === 0) {
        return `No encontré ninguna canción que coincida con ${action.query}.`;
      }
      const playRes = await hbgCore.dispatchAction("music.playTrack", { index: 1 });
      if (playRes.success) {
        const track = (playRes.data as { track?: { title?: string } } | undefined)?.track;
        return `Reproduciendo ${track?.title ?? action.query}.`;
      }
      return playRes.error ?? "No se pudo reproducir esa canción.";
    }

    default:
      return "No entendí el comando.";
  }
}