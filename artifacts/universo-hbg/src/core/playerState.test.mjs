import assert from "node:assert/strict";
import test from "node:test";
import { HBGCore } from "./hbgCore.ts";

test("HBG Core exposes a validated player snapshot and notifies subscribers", () => {
  const core = new HBGCore();
  const received = [];
  assert.equal(core.getPlayerState(), null);

  core.subscribePlayerState((state) => received.push(state));
  core.setPlayerState({
    trackId: "track-001",
    isPlaying: true,
    volume: 64,
  });

  assert.deepEqual(core.getPlayerState(), {
    trackId: "track-001",
    isPlaying: true,
    volume: 64,
  });
  assert.deepEqual(received, [{
    trackId: "track-001",
    isPlaying: true,
    volume: 64,
  }]);
});

test("HBG Core returns copies and skips unchanged player snapshots", () => {
  const core = new HBGCore();
  let notifications = 0;
  core.subscribePlayerState(() => { notifications += 1; });

  const state = { trackId: "track-002", isPlaying: false, volume: 70 };
  core.setPlayerState(state);
  core.setPlayerState({ ...state });
  const snapshot = core.getPlayerState();
  snapshot.volume = 0;

  assert.equal(notifications, 1);
  assert.equal(core.getPlayerState().volume, 70);
});

test("HBG Core rejects malformed player snapshots without replacing valid state", () => {
  const core = new HBGCore();
  const valid = { trackId: "track-003", isPlaying: true, volume: 35 };
  core.setPlayerState(valid);

  const invalidStates = [
    { trackId: "", isPlaying: true, volume: 35 },
    { trackId: 12, isPlaying: true, volume: 35 },
    { trackId: null, isPlaying: "yes", volume: 35 },
    { trackId: null, isPlaying: false, volume: -1 },
    { trackId: null, isPlaying: false, volume: 101 },
    { trackId: null, isPlaying: false, volume: Number.NaN },
  ];

  for (const invalid of invalidStates) {
    assert.throws(
      () => core.setPlayerState(invalid),
      /estado del reproductor/i,
    );
    assert.deepEqual(core.getPlayerState(), valid);
  }
});

test("HBG Core player state subscriptions can be removed", () => {
  const core = new HBGCore();
  let notifications = 0;
  const unsubscribe = core.subscribePlayerState(() => { notifications += 1; });

  core.setPlayerState({ trackId: null, isPlaying: false, volume: 0 });
  unsubscribe();
  core.setPlayerState({ trackId: "track-004", isPlaying: true, volume: 90 });

  assert.equal(notifications, 1);
});
