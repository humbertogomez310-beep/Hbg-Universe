import type { TrackMeta } from "../core/vibraDB";

export type MoodCategory =
  | "happy" | "sad" | "party" | "focus" | "creative" | "chill"
  | "nostalgia" | "romantic" | "dance" | "sing" | "ambient"
  | "birthday" | "kids" | "drinking" | "celebration";

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

/**
 * Offline, explainable first-pass classification. Numeric signals are
 * heuristics, not a claim that BPM or key can determine human emotion.
 * Scenario tags (kids/birthday/drinking) require explicit local metadata words.
 */
export function classifyTrackMoods(track: Pick<TrackMeta,
  "title" | "artist" | "album" | "bpm" | "bpmConfidence" | "beatStrength" |
  "energyLevel" | "impactStrength" | "musicalKey" | "keyConfidence"
>): Partial<Record<MoodCategory, number>> {
  const text = normalize(`${track.title} ${track.artist} ${track.album}`);
  const bpm = track.bpmConfidence !== undefined && track.bpmConfidence >= 0.25 ? track.bpm : undefined;
  const energy = track.energyLevel;
  const beat = track.beatStrength ?? 0;
  const impact = track.impactStrength ?? 0;
  const key = track.keyConfidence !== undefined && track.keyConfidence >= 0.3 ? track.musicalKey?.toLowerCase() : undefined;
  const scores: Partial<Record<MoodCategory, number>> = {};
  const set = (category: MoodCategory, score: number) => {
    if (score >= 0.3) scores[category] = Math.max(scores[category] ?? 0, Math.min(1, score));
  };
  const has = (pattern: RegExp) => pattern.test(text);

  if (energy !== undefined && bpm !== undefined) {
    if (energy >= 0.55 && bpm >= 95) set("happy", 0.45 + Math.min(0.4, (energy - 0.55) * 0.8));
    if (energy <= 0.5 && bpm <= 90 && key?.includes("minor")) set("sad", 0.5 + (0.5 - energy) * 0.5);
    if (energy <= 0.4 && bpm <= 100) set("chill", 0.45 + (0.4 - energy) * 0.7);
    if (bpm >= 105 && bpm <= 165 && energy >= 0.45 && beat >= 0.2) set("dance", 0.55 + beat * 0.25);
    if (bpm >= 115 && bpm <= 165 && energy >= 0.62 && impact >= 0.3) set("party", 0.6 + impact * 0.25);
    if (energy >= 0.3 && energy <= 0.62 && bpm >= 75 && bpm <= 125) set("creative", 0.38);
    if (energy <= 0.5 && bpm <= 95 && beat <= 0.3) set("focus", 0.38);
  }
  if (key?.includes("major") && energy !== undefined && energy >= 0.45) set("happy", 0.48);
  if (key?.includes("minor") && energy !== undefined && energy <= 0.55) set("sad", 0.48);

  if (has(/\b(romantica|romantico|amor|love|balada|enamorad[oa])\b/)) set("romantic", 0.95);
  if (has(/\b(karaoke|cantar|cantando|sing along|vocal|en vivo|live)\b/)) set("sing", 0.9);
  if (has(/\b(ambient|ambiental|instrumental|relajacion|meditacion|nature sounds)\b/)) set("ambient", 0.95);
  if (has(/\b(80s|ochentas|ochenta|90s|noventas|noventa|retro|oldies|clasicos|vintage)\b/)) set("nostalgia", 0.9);
  if (has(/\b(cumpleanos|birthday|feliz cumple)\b/)) { set("birthday", 0.98); set("celebration", 0.85); }
  if (has(/\b(ninos|ninas|infantil|infantiles|kids|children|canciones para ninos)\b/)) set("kids", 0.98);
  if (has(/\b(tomar|cantina|bar|bebida|bebidas|brindis|drinking)\b/)) set("drinking", 0.82);
  if (has(/\b(fiesta|party|celebracion|celebrar|festejo|festejar)\b/)) set("celebration", 0.9);
  if (has(/\b(bailar|bailable|dance|club|disco)\b/)) set("dance", 0.9);
  return scores;
}
