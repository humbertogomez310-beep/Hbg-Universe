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