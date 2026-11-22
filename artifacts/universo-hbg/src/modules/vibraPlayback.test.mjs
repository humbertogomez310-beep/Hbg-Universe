import assert from "node:assert/strict";
import test from "node:test";
import {
  selectNextPlaybackId,
  selectPreviousPlaybackId,
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
});
