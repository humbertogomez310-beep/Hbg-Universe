import type { TrackMeta } from "../core/vibraDB";

/**
 * Returns only tracks that still need local musical analysis.
 * The next Auto DJ candidate is placed first so the transition planner can
 * benefit from its metadata before background analysis continues.
 */
export function isTrackAnalysisPending(track: TrackMeta): boolean {
  return (
    track.beatStrength === undefined ||
    track.energyLevel === undefined ||
    track.impactStrength === undefined ||
    track.analyzedAt === undefined
  );
}

export function buildAutoDjAnalysisQueue(
  tracks: readonly TrackMeta[],
  priorityTrackIds: readonly string[] = [],
): string[] {
  const priority = new Map(priorityTrackIds.map((id, index) => [id, index]));
  return tracks
    .filter(isTrackAnalysisPending)
    .map((track, index) => ({ id: track.id, index, priority: priority.get(track.id) ?? Number.MAX_SAFE_INTEGER }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
    .map(({ id }) => id);
}
