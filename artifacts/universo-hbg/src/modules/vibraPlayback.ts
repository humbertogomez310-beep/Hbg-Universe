export type RepeatMode = "off" | "all" | "one";

function chooseRandom(
  candidates: readonly string[],
  random: () => number,
): string | null {
  if (!candidates.length) return null;
  const value = random();
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(0.999999, value)) : 0;
  return candidates[Math.floor(safeValue * candidates.length)] ?? null;
}

export function selectNextPlaybackId(
  trackIds: readonly string[],
  currentId: string | null,
  shuffle: boolean,
  repeat: RepeatMode,
  recentIds: readonly string[] = [],
  random: () => number = Math.random,
): string | null {
  if (!trackIds.length) return null;
  const currentIndex = currentId ? trackIds.indexOf(currentId) : -1;
  if (currentIndex < 0) return trackIds[0] ?? null;
  if (repeat === "one") return currentId;

  if (shuffle) {
    const remaining = trackIds.filter((id) => id !== currentId);
    if (!remaining.length) return repeat === "all" ? currentId : null;
    const fresh = remaining.filter((id) => !recentIds.includes(id));
    return chooseRandom(fresh.length ? fresh : remaining, random);
  }

  if (currentIndex < trackIds.length - 1) return trackIds[currentIndex + 1] ?? null;
  return repeat === "all" ? trackIds[0] ?? null : null;
}

export function selectPreviousPlaybackId(
  trackIds: readonly string[],
  currentId: string | null,
  shuffle: boolean,
  repeat: RepeatMode,
  recentIds: readonly string[] = [],
  random: () => number = Math.random,
): string | null {
  if (!trackIds.length) return null;
  const currentIndex = currentId ? trackIds.indexOf(currentId) : -1;
  if (currentIndex < 0) return trackIds[0] ?? null;

  if (repeat === "one") return currentId;

  if (shuffle) {
    const remaining = trackIds.filter((id) => id !== currentId);
    if (!remaining.length) return repeat === "all" ? currentId : null;
    const fresh = remaining.filter((id) => !recentIds.includes(id));
    return chooseRandom(fresh.length ? fresh : remaining, random);
  }

  if (currentIndex > 0) return trackIds[currentIndex - 1] ?? null;
  return repeat === "all" ? trackIds[trackIds.length - 1] ?? null : null;
}
