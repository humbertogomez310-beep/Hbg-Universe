import type { TrackMeta } from "../core/vibraDB";

export interface MusicDirection {
  goal: string;
  energy: "steady" | "up";
  /** Optional user intent; older saved directions remain compatible. */
  vocalFocus?: boolean;
}

const STOP_WORDS = new Set([
  "ahora", "algo", "baila", "bailable", "cancion", "canciones", "con",
  "de", "el", "en", "estilo", "la", "las", "lo", "los", "mas", "musica",
  "para", "pero", "pon", "quiero", "reproduce", "mantén", "manten", "un",
  "una", "este", "más",
]);

const HIGH_ENERGY_HINTS = new Set([
  "dance", "club", "remix", "party", "bailable", "rock", "metal", "electro",
  "techno", "house", "upbeat", "energetic", "festival", "movida", "intensa",
]);
const LOW_ENERGY_HINTS = new Set([
  "acoustic", "acustico", "ambient", "slow", "chill", "relax", "balada",
  "suave", "lenta", "piano", "instrumental",
]);
const VOCAL_HINTS = new Set([
  "karaoke", "sing", "cantar", "cantable", "live", "voz", "vocal", "balada",
  "acoustic", "acustico",
]);

const ERA_ALIASES: Record<string, string[]> = {
  noventa: ["noventa", "noventas", "noventera", "noventero", "90s", "1990", "1990s"],
  fiesta: ["fiesta", "party", "dance", "club"],
  ochenta: ["ochenta", "ochentas", "ochentera", "ochentero", "80s", "1980", "1980s"],
  setenta: ["setenta", "setentas", "70s", "1970", "1970s"],
  vieja: ["vieja", "viejita", "clasica", "clasico", "clasicos", "oldies", "retro", "vintage", "setenta", "ochenta", "noventa", "70s", "80s", "90s"],
  viejita: ["vieja", "viejita", "clasica", "clasico", "clasicos", "oldies", "retro", "vintage", "setenta", "ochenta", "noventa", "70s", "80s", "90s"],
  clasicos: ["clasica", "clasico", "clasicos", "oldies", "retro", "vintage"],
};

export function normalizeMusicText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function interpretMusicDirection(
  text: string,
  current: MusicDirection,
): MusicDirection | null {
  const normalized = normalizeMusicText(text);
  if (!normalized) return null;

  const wantsMoreEnergy = /\b(mas energia|mas bailable|hazlo mas bailable|sube la energia|mas movida|mas intenso|mas intensa)\b/.test(normalized);
  const wantsVocals = /\b(mas para cantar|para cantar|mas cantable|canciones para cantar|karaoke)\b/.test(normalized);

  if (wantsMoreEnergy || wantsVocals) {
    if (!current.goal.trim() && !wantsVocals && current.energy !== "up") {
      return { ...current, energy: "up" };
    }
    return {
      ...current,
      ...(wantsMoreEnergy ? { energy: "up" as const } : {}),
      ...(wantsVocals ? { vocalFocus: true } : {}),
    };
  }

  const goal = normalized
    .replace(/^(?:pon|quiero|reproduce|ponme|ahora quiero|ahora|hazlo|manten|mantén)\s+/, "")
    .replace(/^musica\s+/, "")
    .replace(/^(?:el|la|los|las|un|una)\s+/, "")
    .replace(/\bmas para cantar\b/g, "")
    .replace(/\bpara cantar\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const vocalFocus = /\b(cantar|cantable|karaoke|voz|vocal)\b/.test(normalized);
  const cleanedGoal = goal.replace(/\b(cantar|cantable|karaoke)\b/g, "").replace(/\s+/g, " ").trim();
  if (!cleanedGoal && !vocalFocus) return null;

  return {
    goal: cleanedGoal,
    energy: "steady",
    ...(vocalFocus ? { vocalFocus: true } : {}),
  };
}

function goalTerms(goal: string): string[] {
  const terms = normalizeMusicText(goal)
    .split(" ")
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term));
  return [...new Set(terms.flatMap((term) => ERA_ALIASES[term] ?? [term]))];
}

function metadataTerms(track: TrackMeta): Set<string> {
  return new Set(normalizeMusicText(`${track.title} ${track.artist} ${track.album}`).split(" "));
}

function scoreTrack(
  track: TrackMeta,
  terms: string[],
  direction: MusicDirection,
): number | null {
  const metadata = metadataTerms(track);
  const matchedTerms = terms.filter((term) => metadata.has(term)).length;
  if (terms.length > 0 && matchedTerms === 0) return null;

  let score = matchedTerms * 10;
  if (direction.energy === "up") {
    if ([...HIGH_ENERGY_HINTS].some((hint) => metadata.has(hint))) score += 4;
    if ([...LOW_ENERGY_HINTS].some((hint) => metadata.has(hint))) score -= 2;
  }
  const vocalHintCount = [...VOCAL_HINTS].filter((hint) => metadata.has(hint)).length;
  if (direction.vocalFocus && vocalHintCount === 0) return null;
  if (direction.vocalFocus) score += vocalHintCount * 4;
  return score;
}

/**
 * Selects only from the user's local library. It ranks textual metadata hints
 * and avoids recent tracks when alternatives exist; it does not infer BPM,
 * inspect audio waveforms, or claim genre/emotion detection.
 */
export function selectTracksForDirection(
  tracks: TrackMeta[],
  direction: MusicDirection,
  limit = 50,
): TrackMeta[] {
  const terms = goalTerms(direction.goal);
  if (!terms.length && !direction.vocalFocus && direction.energy !== "up") return [];
  if (
    !terms.length &&
    direction.energy === "up" &&
    !tracks.some((track) => [...HIGH_ENERGY_HINTS].some((hint) => metadataTerms(track).has(hint)))
  ) return [];
  return tracks
    .map((track, index) => ({ track, index, score: scoreTrack(track, terms, direction) }))
    .filter((item): item is { track: TrackMeta; index: number; score: number } => item.score !== null)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Math.max(0, limit))
    .map(({ track }) => track);
}

export function selectNextTrack(
  tracks: TrackMeta[],
  currentId: string | null,
  recentTrackIds: string[],
  direction: MusicDirection,
): TrackMeta | null {
  const candidates = selectTracksForDirection(
    tracks.filter((track) => track.id !== currentId),
    direction,
    tracks.length,
  );
  const notRecentlyPlayed = candidates.filter((track) => !recentTrackIds.includes(track.id));
  return notRecentlyPlayed[0] ?? candidates[0] ?? null;
}

export function readMusicDirection(storage: Storage): MusicDirection {
  try {
    const value: unknown = JSON.parse(storage.getItem("hbg_vibra_music_direction") ?? "null");
    if (
      value &&
      typeof value === "object" &&
      "goal" in value &&
      typeof value.goal === "string" &&
      "energy" in value &&
      (value.energy === "steady" || value.energy === "up")
    ) {
      return {
        goal: value.goal,
        energy: value.energy,
        ...("vocalFocus" in value && value.vocalFocus === true ? { vocalFocus: true } : {}),
      };
    }
  } catch {
    // Ignore malformed stored session state and start with an empty direction.
  }
  return { goal: "", energy: "steady" };
}
