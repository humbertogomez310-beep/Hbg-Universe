import assert from "node:assert/strict";
import test from "node:test";
import {
  selectNextPlaybackId,
  selectPreviousPlaybackId,
  shouldRestorePlaybackAfterInterruption,
  recoverPlaybackPosition,
  resolveAutoDjSessionQueueIds,
} from "./vibraPlayback.ts";

const ids = ["a", "b", "c"];

test("VIBRA advances sequentially and stops at the end when repeat is off", () => {
  assert.equal(selectNextPlaybackId(ids, "a", false, "off"), "b");
  assert.equal(selectNextPlaybackId(ids, "c", false, "off"), null);
});

test("VIBRA wraps the queue for repeat-all and repeats the current track for repeat-one", () => {
  assert.equal(selectNextPlaybackId(ids, "c", false, "all"), "a");
  assert.equal(selectNextPlaybackId(ids, "b", false, "one"), "b");
  assert.equal(selectPreviousPlaybackId(ids, "a", false, "all"), "c");
});

test("VIBRA shuffle avoids the current and recent tracks when alternatives exist", () => {
  assert.equal(selectNextPlaybackId(ids, "a", true, "off", ["a", "b"], () => 0), "c");
  assert.equal(selectNextPlaybackId(ids, "a", true, "off", ["a", "b", "c"], () => 0), "b");
  assert.equal(selectPreviousPlaybackId(ids, "c", true, "off", ["c"], () => 0), "a");
});

test("VIBRA handles empty queues and single-track repeat modes", () => {
  assert.equal(selectNextPlaybackId([], null, true, "all"), null);
  assert.equal(selectNextPlaybackId(["solo"], "solo", true, "off"), null);
  assert.equal(selectNextPlaybackId(["solo"], "solo", true, "all"), "solo");
  assert.equal(selectPreviousPlaybackId(["solo"], "solo", true, "off"), null);
  assert.equal(selectPreviousPlaybackId(["solo"], "solo", true, "one"), "solo");
  assert.equal(selectPreviousPlaybackId(["solo"], "solo", true, "all"), "solo");
});


test("VIBRA restores only a track that was playing before an external app interruption", () => {
  const snapshot = { trackId: "b", wasPlaying: true, currentTime: 42 };
  assert.equal(shouldRestorePlaybackAfterInterruption(snapshot, "b", false), true);
  assert.equal(shouldRestorePlaybackAfterInterruption(snapshot, "b", true), false);
  assert.equal(shouldRestorePlaybackAfterInterruption(snapshot, "c", false), false);
  assert.equal(shouldRestorePlaybackAfterInterruption({ ...snapshot, wasPlaying: false }, "b", false), false);
});

test("VIBRA recovers a reset media position but never rewinds a track that advanced", () => {
  assert.equal(recoverPlaybackPosition(0, 42), 42);
  assert.equal(recoverPlaybackPosition(39, 42), 39);
  assert.equal(recoverPlaybackPosition(Number.NaN, 42), 42);
  assert.equal(recoverPlaybackPosition(42, Number.NaN), 42);
});


test("Auto DJ restores its saved queue order and filters missing or duplicate tracks", () => {
  assert.deepEqual(
    resolveAutoDjSessionQueueIds(["c", "missing", "a", "c", "b"], ["a", "b", "c", "d"]),
    ["c", "a", "b"],
  );
});

test("Auto DJ falls back to library order when no session queue was saved", () => {
  assert.deepEqual(resolveAutoDjSessionQueueIds(null, ["b", "a"]), ["b", "a"]);
  assert.deepEqual(resolveAutoDjSessionQueueIds([], ["b", "a"]), ["b", "a"]);
});
