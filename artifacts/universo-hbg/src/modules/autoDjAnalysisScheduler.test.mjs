import assert from "node:assert/strict";
import test from "node:test";
import { buildAutoDjAnalysisQueue, isTrackAnalysisPending } from "./autoDjAnalysisScheduler.ts";

const track = (id, overrides = {}) => ({
  id, title: id, artist: "", album: "", duration: 180, size: 1,
  type: "audio/mpeg", importedAt: 1, ...overrides,
});

test("Auto DJ analysis queue includes tracks missing any required analysis field", () => {
  const complete = track("complete", {
    beatStrength: 0.5, energyLevel: 0.6, impactStrength: 0.4, analyzedAt: 123, moodScores: { happy: 0.8 },
  });
  assert.equal(isTrackAnalysisPending(complete), false);
  assert.equal(isTrackAnalysisPending(track("pending")), true);
  assert.deepEqual(buildAutoDjAnalysisQueue([complete, track("pending")]), ["pending"]);
});

test("next DJ candidate is prioritized before remaining background analysis", () => {
  const tracks = [track("later"), track("next"), track("first")];
  assert.deepEqual(buildAutoDjAnalysisQueue(tracks, ["next"]), ["next", "later", "first"]);
});

test("priority order is stable and completed tracks never enter the queue", () => {
  const complete = track("done", {
    beatStrength: 0.5, energyLevel: 0.6, impactStrength: 0.4, analyzedAt: 123, moodScores: { happy: 0.8 },
  });
  const tracks = [track("a"), complete, track("b"), track("c")];
  assert.deepEqual(buildAutoDjAnalysisQueue(tracks, ["c", "a"]), ["c", "a", "b"]);
  assert.deepEqual(tracks.map((item) => item.id), ["a", "done", "b", "c"]);
});
