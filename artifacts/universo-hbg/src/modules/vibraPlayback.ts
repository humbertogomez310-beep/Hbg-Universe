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


export interface PlaybackInterruptionSnapshot {
  trackId: string | null;
  wasPlaying: boolean;
  currentTime: number;
}

/** Resume only the same track that was playing before the app lost visibility. */
export function shouldRestorePlaybackAfterInterruption(
  snapshot: PlaybackInterruptionSnapshot,
  currentTrackId: string | null,
  explicitlyPaused: boolean,
): boolean {
  return snapshot.wasPlaying && !explicitlyPaused && snapshot.trackId !== null && snapshot.trackId === currentTrackId;
}

/** Recover a browser-reset media position without rewinding a track that kept advancing. */
export function recoverPlaybackPosition(currentTime: number, savedTime: number): number {
  const current = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0;
  const saved = Number.isFinite(savedTime) ? Math.max(0, savedTime) : 0;
  // Ignore normal playback progress while the app was backgrounded; only
  // correct a meaningful decoder reset, not a few seconds of natural drift.
  return saved > current + 5 ? saved : current;
}


/** Keep an Auto DJ session's own queue order while dropping tracks no longer in the library. */
export function resolveAutoDjSessionQueueIds(
  sessionQueueIds: readonly string[] | null | undefined,
  availableTrackIds: readonly string[],
): string[] {
  const available = new Set(availableTrackIds);
  const source = sessionQueueIds && sessionQueueIds.length > 0 ? sessionQueueIds : availableTrackIds;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of source) {
    if (available.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}


/** Convert VIBRA's 0–100 UI percentage into a safe normalized audio gain. */
export function normalizeVibraVolumePercent(percent: number): number {
  return Number.isFinite(percent)
    ? Math.max(0, Math.min(100, percent)) / 100
    : 0;
}
