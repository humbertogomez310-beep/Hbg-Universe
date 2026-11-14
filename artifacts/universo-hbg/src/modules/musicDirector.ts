import type { TrackMeta } from "../core/vibraDB";

export interface MusicDirection {
  goal: string;
  energy: "steady" | "up";
}

const STOP_WORDS = new Set([
  "ahora", "algo", "baila", "bailable", "cancion", "canciones", "con",
  "de", "el", "en", "estilo", "la", "las", "lo", "los", "mas", "musica",
  "para", "pero", "pon", "quiero", "reproduce", "mantén", "manten", "un",
  "una", "este",
]);

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

  if (/manten .*estilo.*mas energia|mas energia|mas bailable|hazlo mas bailable/.test(normalized)) {
    return { ...current, energy: "up" };
  }

  const goal = normalized
    .replace(/^(?:pon|quiero|reproduce|ponme|ponme|ahora quiero)\s+/, "")
    .replace(/^musica\s+/, "")
    .replace(/^(?:el|la|los|las|un|una)\s+/, "")
    .trim();
  if (!goal || /^(?:mas|mas bailable|mas romantica)$/.test(goal)) return null;

  return { goal, energy: "steady" };
}

function goalTerms(goal: string): string[] {
  return normalizeMusicText(goal)
    .split(" ")
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term));
}

export function selectNextTrack(
  tracks: TrackMeta[],
  currentId: string | null,
  recentTrackIds: string[],
  direction: MusicDirection,
): TrackMeta | null {
  const terms = goalTerms(direction.goal);
  const candidates = tracks.filter((track) => {
    if (track.id === currentId) return false;
    if (!terms.length) return true;
    const metadata = normalizeMusicText(`${track.title} ${track.artist} ${track.album}`);
    const metadataTerms = metadata.split(" ");
    return terms.some((term) => metadataTerms.includes(term));
  });

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
      return { goal: value.goal, energy: value.energy };
    }
  } catch {
    // Ignore malformed stored session state and start with an empty direction.
  }
  return { goal: "", energy: "steady" };
}
