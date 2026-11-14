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
  | { type: "SET_DIRECTION"; text: string }
  | { type: "SET_AUTO_DJ"; enabled: boolean }
  | { type: "SET_PARTY"; enabled: boolean }
  | { type: "NOW_PLAYING" }
  | { type: "SET_VOLUME"; volume: number }
  | { type: "PLAYLIST_CREATE"; name: string; query?: string }
  | { type: "PLAYLIST_ADD"; name: string }
  | { type: "PLAYLIST_REMOVE"; name: string }
  | { type: "PLAYLIST_PLAY"; name: string }
  | { type: "PLAY_TRACK"; query: string }
  | { type: "UNKNOWN"; raw: string };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
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

  if (/^(activa|activar|enciende) (el )?auto dj$/.test(n)) return { type: "SET_AUTO_DJ", enabled: true };
  if (/^(desactiva|desactivar|apaga) (el )?auto dj$/.test(n)) return { type: "SET_AUTO_DJ", enabled: false };
  if (/^(activa|activar|enciende) (el )?modo fiesta$/.test(n)) return { type: "SET_MOOD", mood: "party" };
  if (/^(desactiva|desactivar|apaga) (el )?modo fiesta$/.test(n)) return { type: "SET_MOOD", mood: "normal" };
  if (/^(activa|activar|enciende) (el )?modo fiesta pro$/.test(n)) return { type: "SET_PARTY", enabled: true };
  if (/^(desactiva|desactivar|apaga) (el )?modo fiesta pro$/.test(n)) return { type: "SET_PARTY", enabled: false };
  if (/^que cancion (esta )?sonando$/.test(n) || /^que suena$/.test(n)) return { type: "NOW_PLAYING" };

  const volumeMatch = n.match(/^(?:pon|ajusta|cambia) (?:el )?volumen (?:a )?(\d{1,3})%?$/);
  if (volumeMatch) return { type: "SET_VOLUME", volume: Number(volumeMatch[1]) };

  const createPlaylistMatch = n.match(/^crea(?:r)? (?:una )?(?:playlist|lista)(?: llamada)? (.+)$/);
  if (createPlaylistMatch) {
    const description = createPlaylistMatch[1].replace(/^de /, "").trim();
    return description
      ? { type: "PLAYLIST_CREATE", name: description, query: description }
      : { type: "UNKNOWN", raw };
  }
  const addPlaylistMatch = n.match(/^(?:agrega|anade|añade) (?:esta )?(?:cancion )?(?:a|en) (?:mi )?(?:playlist|lista) (.+)$/);
  if (addPlaylistMatch) return { type: "PLAYLIST_ADD", name: addPlaylistMatch[1].trim() };
  const removePlaylistMatch = n.match(/^(?:quita|elimina) (?:esta )?(?:cancion )?(?:de|en) (?:mi )?(?:playlist|lista) (.+)$/);
  if (removePlaylistMatch) return { type: "PLAYLIST_REMOVE", name: removePlaylistMatch[1].trim() };
  const playPlaylistMatch = n.match(/^(?:reproduce|reproducir|pon) (?:mi )?(?:playlist|lista) (.+)$/);
  if (playPlaylistMatch) return { type: "PLAYLIST_PLAY", name: playPlaylistMatch[1].trim() };

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

  if (
    /^(?:pon|quiero|ahora quiero|hazlo|mant[eé]n|manten)\b/.test(n) &&
    /\b(musica|noventa|ochenta|90s|80s|romantica|bailable|cantar|vieja|energia|estilo)\b/.test(n)
  ) {
    return { type: "SET_DIRECTION", text };
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