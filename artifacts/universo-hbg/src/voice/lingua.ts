/**
 * HBG LINGUA — deterministic, local-first language normalization.
 *
 * This layer normalizes speech transcripts before intent classification.
 * It does not execute actions, grant permissions, or provide always-on wake-word detection.
 */

export interface NormalizedUtterance {
  raw: string;
  text: string;
  wakePhrasePresent: boolean;
}

const WAKE_PREFIX = /^(?:oye|hey|hola) hbg\b\s*/;

function normalizeBase(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeUtterance(input: string): string {
  return normalizeBase(input).replace(WAKE_PREFIX, "").trim();
}

export function inspectUtterance(input: string): NormalizedUtterance {
  const normalized = normalizeBase(input);
  return {
    raw: input,
    text: normalized.replace(WAKE_PREFIX, "").trim(),
    wakePhrasePresent: /^(?:oye|hey|hola) hbg\b/.test(normalized),
  };
}

export type VoiceAction =
  | { type: "NAVIGATE"; module: "universo" | "instinto" | "vibra" }
  | { type: "APP_INFO"; module: "universo" | "instinto" | "vibra" }
  | { type: "CAPABILITIES" }
  | { type: "CREATE_SONG"; title: string }
  | { type: "INSTINTO_IDEA"; context: string }
  | { type: "INSTINTO_HOOK" }
  | { type: "BLOCKED_DEVELOPMENT" }
  | { type: "GREETING" }
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
  | { type: "ADJUST_VOLUME"; delta: number }
  | { type: "PLAYLIST_CREATE"; name: string; query?: string }
  | { type: "PLAYLIST_ADD"; name: string }
  | { type: "PLAYLIST_REMOVE"; name: string }
  | { type: "PLAYLIST_PLAY"; name: string }
  | { type: "PLAY_TRACK"; query: string }
  | { type: "UNKNOWN"; raw: string };

function resolvePublicModule(text: string): "universo" | "instinto" | "vibra" | null {
  // Public aliases map only to existing applications; sub-features are not
  // treated as executable operations unless an app action is registered.
  if (/\b(instinto|notas|letras|creatividad|proyectos|mis notas|mis letras|mis proyectos|bloc de notas)\b/.test(text)) return "instinto";
  if (/\b(vibra|musica|reproductor|audio|auto dj|dj vibra|playlist|playlists|biblioteca musical)\b/.test(text)) return "vibra";
  if (/\b(universo|hbg core|core|inicio|panel principal|centro de control)\b/.test(text)) return "universo";
  return null;
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

function classifyPlaybackControl(n: string): VoiceAction | null {
  // Playback controls are classified before song-title matching. This prevents
  // phrases such as "páusalo" and "pon pausa" from becoming track searches.
  const pauseRequests = [
    /^(?:pausa|pausar|pause)$/,
    /^(?:pon|ponme) (?:en )?pausa$/,
    /^(?:pon|ponme) (?:lo|la|los|las) en pausa$/,
    /^(?:ponlo|ponla|ponlos|ponlas) en pausa$/,
    /^(?:pon|deja) (?:la )?(?:musica|reproduccion|cancion) en pausa$/,
    /^(?:pausalo|pausala|pausalos|pausalas|pausame)$/,
    /^(?:pausa|pausame) (?:la )?(?:musica|reproduccion|cancion)$/,
    /^(?:deten|detiene|para) (?:la )?(?:musica|reproduccion|cancion|esto|eso)$/,
    /^(?:quiero que|puedes|podrias) (?:pauses|pausar|detengas|pares) (?:la )?(?:musica|reproduccion|cancion|esto|eso)$/,
    /^(?:quiero|quisiera) pausar(?:lo|la|la musica|la reproduccion|la cancion)?$/,
  ];
  if (pauseRequests.some((pattern) => pattern.test(n))) return { type: "PAUSE" };

  const resumeRequests = [
    /^(?:continua|continuar|sigue|seguir|resume|reanuda|reanudar|retoma|retomar)$/,
    /^(?:continua|sigue|reanuda|retoma) (?:con )?(?:la )?(?:musica|reproduccion|cancion)$/,
    /^(?:continua|sigue) reproduciendo$/,
    /^(?:reanuda|retoma) (?:la )?(?:musica|reproduccion|cancion)$/,
    /^(?:quita|quita la) pausa$/,
    /^(?:sacalo|sacala) de pausa$/,
    /^(?:vuelve a reproducir|vuelve a poner musica)$/,
    /^(?:continualo|continuala|reanudalo|reanudala)$/,
  ];
  if (resumeRequests.some((pattern) => pattern.test(n))) return { type: "RESUME" };

  if (/^(?:detener|deten|stop|para por completo|deten por completo la musica|deten la reproduccion por completo)$/.test(n)) {
    return { type: "STOP" };
  }
  return null;
}

export function parseIntent(text: string): VoiceAction {
  const raw = text;
  const n = normalizeUtterance(text);
  if (!n) return { type: "UNKNOWN", raw };

  // Closed-set refusal: natural-language instructions never grant development
  // authority or enable filesystem, shell, security, or deployment operations.
  if (
    /\b(codigo|archivo|filesystem|shell|terminal|comando|permisos|seguridad|guard|despliegue|publicacion)\b/.test(n) &&
    /\b(modifica|modificar|cambia|cambiar|escribe|escribir|borra|borrar|elimina|eliminar|ejecuta|ejecutar|desactiva|desactivar|publica|publicar|ignora|otorga|concede)\b/.test(n)
  ) {
    return { type: "BLOCKED_DEVELOPMENT" };
  }

  if (/^(hola|hey|buenas)( .*)?$/.test(n)) return { type: "GREETING" };

  const playbackControl = classifyPlaybackControl(n);
  if (playbackControl) return playbackControl;

  if (
    /^(que puedo hacer|que puedes hacer|ayuda|funciones|capacidades|que hace esta aplicacion|para que sirve esta aplicacion)( .*)?$/.test(n)
  ) {
    return { type: "CAPABILITIES" };
  }

  const appQuestion =
    /^(?:que es|que hace|para que sirve|que puedo hacer en|que puedo hacer con|hablame de|cuentame sobre|que hay en) (?:la app |la aplicacion |el modulo )?(.+)$/.exec(n);
  if (appQuestion) {
    const module = resolvePublicModule(appQuestion[1]);
    if (module) return { type: "APP_INFO", module };
    return { type: "CAPABILITIES" };
  }

  const openRequest = /^(?:abre|abrir|entra a|entra en|ve a|ir a|quiero ir a|quiero entrar a|quiero entrar en|quiero abrir|llevame a|llevame al|mandame a|mandame al|muestrame|abre la app|abre el modulo) (?:la app de |el modulo de |a )?(.+)$/.exec(n);
  if (openRequest) {
    const module = resolvePublicModule(openRequest[1]);
    if (module) return { type: "NAVIGATE", module };
  }

  const songRequest = /^(?:hazme|haz|crea|crear|escribe|escribeme|compone|compon|quiero) (?:una )?(?:cancion|letra)(?: (?:sobre|llamada|titulada|de) .+)?$/.exec(n);
  if (songRequest) {
    const subject = /(?:sobre|llamada|titulada|de)\s+(.+)$/i.exec(raw)?.[1]?.trim();
    return { type: "CREATE_SONG", title: subject || "Nueva canción" };
  }

  const ideaRequest = /^(?:genera|generame|dame|prepara|crea|hazme) (?:una )?(?:nueva )?idea(?: sobre (.+))?$/.exec(n);
  if (ideaRequest) {
    const context =
      /(?:sobre)\s+(.+)$/i.exec(raw)?.[1]?.trim() ??
      ideaRequest[1]?.trim() ??
      "";
    return { type: "INSTINTO_IDEA", context };
  }

  const hookRequest = /^(?:genera|generame|dame|prepara|escribe) (?:un |una )?(?:hook|coro|rima)(?: sobre (.+))?$/;
  if (hookRequest.test(n)) return { type: "INSTINTO_HOOK" };

  if (/^(activa|activar|enciende) (el )?auto dj$/.test(n)) return { type: "SET_AUTO_DJ", enabled: true };
  if (/^(desactiva|desactivar|apaga) (el )?auto dj$/.test(n)) return { type: "SET_AUTO_DJ", enabled: false };
  if (/^(activa|activar|enciende) (el )?modo fiesta$/.test(n)) return { type: "SET_MOOD", mood: "party" };
  if (/^(desactiva|desactivar|apaga) (el )?modo fiesta$/.test(n)) return { type: "SET_MOOD", mood: "normal" };
  if (/^(activa|activar|enciende) (el )?modo fiesta pro$/.test(n)) return { type: "SET_PARTY", enabled: true };
  if (/^(desactiva|desactivar|apaga) (el )?modo fiesta pro$/.test(n)) return { type: "SET_PARTY", enabled: false };
  if (/^que cancion (esta )?sonando$/.test(n) || /^que suena$/.test(n)) return { type: "NOW_PLAYING" };

  // Explicit levels take precedence over relative volume language.
  const volumeMatch = n.match(/^(?:(?:pon|ajusta|cambia|deja|fija) (?:el )?volumen|(?:sube|baja|aumenta|disminuye) (?:el )?volumen) (?:(?:a|al) )?(\d{1,3})%?$/);
  if (volumeMatch) {
    const volume = Number(volumeMatch[1]);
    return volume <= 100
      ? { type: "SET_VOLUME", volume }
      : { type: "UNKNOWN", raw };
  }

  // Relative volume changes are persistent user preferences, not temporary voice ducking.
  const volumeDirection = /^(?:sube|subele|subeme|aumenta|incrementa|dale mas fuerte|dale mas|mas alto|mas fuerte|ponlo mas alto|hazlo mas fuerte|que suene mas fuerte)(?: el)?(?: volumen| audio| sonido)?(?: un poquito| un poco| poquito| tantito| bastante| mucho)?$/.test(n)
    ? 1
    : /^(?:baja|bajale|bajame|reduce|disminuye|dale menos|mas bajo|mas bajito|mas suave|ponlo mas bajo|hazlo mas bajito|que suene mas bajo)(?: el)?(?: volumen| audio| sonido)?(?: un poquito| un poco| poquito| tantito| bastante| mucho)?$/.test(n)
      ? -1
      : 0;
  if (volumeDirection !== 0) {
    const intensity = /mucho|bastante/.test(n) ? 20 : /poco|poquito|tantito/.test(n) ? 5 : 10;
    return { type: "ADJUST_VOLUME", delta: volumeDirection * intensity };
  }

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

  // Natural-language playback requests. Keep these intentionally bounded:
  // generic requests control the current queue; named titles still route to PLAY_TRACK.
  const playRequests = [
    /^(?:pon|ponme|reproduce|reproducir|inicia|iniciar|empieza|empezar|arranca|arrancar|activa) (?:a )?(?:la )?musica$/,
    /^(?:pon|ponme|reproduce|reproducir) (?:algo|algo de musica|una cancion|canciones)$/,
    /^(?:quiero|quisiera|me gustaria) (?:escuchar|oir) (?:musica|algo|algo de musica|una cancion)$/,
    /^(?:quiero|quisiera) (?:poner|reproducir) musica$/,
    /^(?:vamos a )?(?:escuchar|oir) (?:musica|algo|una cancion)$/,
    /^(?:haz sonar|que suene) (?:la )?(?:musica|algo|una cancion)$/,
    /^(?:dale|pon) (?:al )?(?:play|reproducir)$/,
    /^(?:play|reproduce|reproducir)$/
  ];
  if (playRequests.some((pattern) => pattern.test(n))) return { type: "PLAY" };
  if (/^(?:siguiente cancion|siguiente|next)$/.test(n)) return { type: "NEXT" };
  if (/^(?:cancion anterior|anterior|previous)$/.test(n)) return { type: "PREVIOUS" };

  if (/^(activa|activar) (el )?(aleatorio|shuffle)$/.test(n)) return { type: "SET_SHUFFLE", value: true };
  if (/^(desactiva|desactivar) (el )?(aleatorio|shuffle)$/.test(n)) return { type: "SET_SHUFFLE", value: false };
  if (/^(activa|activar) (la )?(repetir|repeticion)$/.test(n)) return { type: "SET_REPEAT", value: true };
  if (/^(desactiva|desactivar) (la )?(repetir|repeticion)$/.test(n)) return { type: "SET_REPEAT", value: false };

  const moodMatch = n.match(/^(?:activa|pon|cambia a) (?:el )?modo (\w+)$/);
  if (moodMatch && MOOD_WORDS[moodMatch[1]]) {
    return { type: "SET_MOOD", mood: MOOD_WORDS[moodMatch[1]] };
  }

  if (
    /^(?:pon|quiero|ahora quiero|hazlo|mant[eé]n|manten|mas)\b/.test(n) &&
    /\b(musica|noventa|ochenta|90s|80s|romantica|bailable|cantar|viejita|vieja|clasicos|retro|karaoke|energia|estilo)\b/.test(n)
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

export interface LinguaInterpretation {
  rawText: string;
  normalizedText: string;
  wakePhrasePresent: boolean;
  action: VoiceAction;
  effect: "persistent" | "command" | "unknown";
  requiresClarification: boolean;
  engine: "HBG_LINGUA_RULES_V1";
}

export function interpretUtterance(input: string): LinguaInterpretation {
  const inspected = inspectUtterance(input);
  const action = parseIntent(input);
  const isUnknown = action.type === "UNKNOWN";
  const isPersistent = action.type === "SET_VOLUME" || action.type === "ADJUST_VOLUME";

  return {
    rawText: input,
    normalizedText: inspected.text,
    wakePhrasePresent: inspected.wakePhrasePresent,
    action,
    effect: isUnknown ? "unknown" : isPersistent ? "persistent" : "command",
    requiresClarification: isUnknown,
    engine: "HBG_LINGUA_RULES_V1",
  };
}


export function clarifyUtterance(input: string): string {
  const normalized = normalizeUtterance(input);

  if (/\b(volumen|audio|sonido|musica)\b/.test(normalized)) {
    return "Creo que quieres ajustar el audio, pero no capté cómo. ¿Quieres subirlo, bajarlo o dejarlo en un nivel concreto?";
  }
  if (/\b(abre|entrar|ir a|aplicacion|app|modulo)\b/.test(normalized)) {
    return "¿Qué parte quieres abrir: UNIVERSO, INSTINTO o VIBRA?";
  }
  if (/\b(cancion|letra|componer|crear)\b/.test(normalized)) {
    return "Quiero asegurarme de hacerlo bien. ¿Quieres crear una canción, escribir una letra o reproducir una canción?";
  }
  return "No estoy seguro de lo que quieres hacer. ¿Me lo dices de otra forma?";
}
