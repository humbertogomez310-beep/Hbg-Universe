export type VoiceAction =
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "NEXT" }
  | { type: "PREVIOUS" }
  | { type: "STOP" }
  | { type: "SET_SHUFFLE"; value: boolean }
  | { type: "SET_REPEAT"; value: boolean }
  | { type: "SET_MOOD"; mood: string }
  | { type: "PLAY_TRACK"; query: string }
  | { type: "UNKNOWN"; raw: string };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const MOOD_WORDS: Record<string, string> = {
  fiesta: "party",
  party: "party",
  enfoque: "focus",
  concentracion: "focus",
  focus: "focus",
  creativo: "creative",
  creatividad: "creative",
  chill: "chill",
  relajado: "chill",
  nostalgia: "nostalgia",
  triste: "sad",
  feliz: "happy",
  alegre: "happy",
  normal: "normal",
};

export function parseIntent(text: string): VoiceAction {
  const raw = text;
  const n = normalize(text);
  if (!n) return { type: "UNKNOWN", raw };

  if (/^(activa|activar|enciende) (el )?modo fiesta$/.test(n)) return { type: "SET_MOOD", mood: "party" };
  if (/^(desactiva|desactivar|apaga) (el )?modo fiesta$/.test(n)) return { type: "SET_MOOD", mood: "normal" };

  if (/^(pon musica|reproduce|reproducir|play)$/.test(n)) return { type: "PLAY" };
  if (/^(pausa|pausar|pause)$/.test(n)) return { type: "PAUSE" };
  if (/^(continua|continuar|resume|reanuda|reanudar)$/.test(n)) return { type: "RESUME" };
  if (/^(siguiente cancion|siguiente|next)$/.test(n)) return { type: "NEXT" };
  if (/^(cancion anterior|anterior|previous)$/.test(n)) return { type: "PREVIOUS" };
  if (/^(detener|deten|para|stop)$/.test(n)) return { type: "STOP" };

  if (/^(activa|activar) (el )?(aleatorio|shuffle)$/.test(n)) return { type: "SET_SHUFFLE", value: true };
  if (/^(desactiva|desactivar) (el )?(aleatorio|shuffle)$/.test(n)) return { type: "SET_SHUFFLE", value: false };
  if (/^(activa|activar) (la )?(repetir|repeticion)$/.test(n)) return { type: "SET_REPEAT", value: true };
  if (/^(desactiva|desactivar) (la )?(repetir|repeticion)$/.test(n)) return { type: "SET_REPEAT", value: false };

  const moodMatch = n.match(/^(?:activa|pon|cambia a) (?:el )?modo (\w+)$/);
  if (moodMatch && MOOD_WORDS[moodMatch[1]]) {
    return { type: "SET_MOOD", mood: MOOD_WORDS[moodMatch[1]] };
  }

  const playTrackMatch = n.match(/^(?:reproduce|reproducir|pon)\s+(.+)$/);
  if (playTrackMatch) {
    const query = playTrackMatch[1].trim();
    if (query && query !== "musica") {
      return { type: "PLAY_TRACK", query };
    }
  }

  return { type: "UNKNOWN", raw };
}