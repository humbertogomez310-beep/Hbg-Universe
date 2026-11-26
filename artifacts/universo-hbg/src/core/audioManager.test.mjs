import assert from "node:assert/strict";
import test from "node:test";
import {
  beginVoiceAudioSession,
  calculateEffectiveAudioVolume,
  prepareAudioForUpdate,
  cancelAudioUpdatePreparation,
  getCurrentAudioDuckingFactor,
  registerAudioOutput,
  registerAudioSessionLifecycle,
  preventVoiceSessionPlaybackRestore,
} from "./audioManager.ts";

test("HBG audio manager ducks registered outputs and restores their prior level", () => {
  const factors = [];
  const unregister = registerAudioOutput("test-output", (factor) => factors.push(factor));
  try {
    assert.equal(getCurrentAudioDuckingFactor(), 1);
    const release = beginVoiceAudioSession();
    assert.equal(getCurrentAudioDuckingFactor(), 0.55);
    release();
    assert.equal(getCurrentAudioDuckingFactor(), 1);
    assert.deepEqual(factors, [1, 0.55, 1]);
  } finally {
    unregister();
  }
});

test("overlapping voice sessions keep audio ducked until the final session ends", () => {
  const factors = [];
  const unregister = registerAudioOutput("overlap-output", (factor) => factors.push(factor));
  try {
    const releaseFirst = beginVoiceAudioSession();
    const releaseSecond = beginVoiceAudioSession();
    releaseFirst();
    assert.equal(getCurrentAudioDuckingFactor(), 0.55);
    releaseSecond();
    assert.equal(getCurrentAudioDuckingFactor(), 1);
    assert.deepEqual(factors, [1, 0.55, 1]);
  } finally {
    unregister();
  }
});

test("effective output volume combines the persistent level and temporary ducking safely", () => {
  assert.ok(Math.abs(calculateEffectiveAudioVolume(0.8, 0.55) - 0.44) < 1e-12);
  assert.equal(calculateEffectiveAudioVolume(0.8, 1), 0.8);
  assert.equal(calculateEffectiveAudioVolume(2, 0.5), 0.5);
  assert.equal(calculateEffectiveAudioVolume(-1, 0.5), 0);
  assert.equal(calculateEffectiveAudioVolume(Number.NaN, 0.5), 0);
});

test("voice session release is idempotent and a late output receives current ducking", () => {
  const release = beginVoiceAudioSession();
  const factors = [];
  const unregister = registerAudioOutput("late-output", (factor) => factors.push(factor));
  try {
    assert.equal(getCurrentAudioDuckingFactor(), 0.55);
    assert.deepEqual(factors, [0.55]);
    release();
    release();
    assert.deepEqual(factors, [0.55, 1]);
  } finally {
    unregister();
  }
});

test("voice session lifecycle restores interrupted playback unless the user explicitly paused", () => {
  const events = [];
  const lifecycle = {
    onStart: () => events.push("start"),
    onEnd: (shouldRestore) => events.push(shouldRestore ? "restore" : "keep-paused"),
  };
  const unregister = registerAudioSessionLifecycle("lifecycle-test", lifecycle);
  try {
    const release = beginVoiceAudioSession();
    release();
    const secondRelease = beginVoiceAudioSession();
    preventVoiceSessionPlaybackRestore();
    secondRelease();
    assert.deepEqual(events, ["start", "restore", "start", "keep-paused"]);
  } finally {
    unregister();
  }
});

test("PWA update preparation pauses registered outputs and cancellation restores them", async () => {
  const events = [];
  const lifecycle = {
    onBeforeUpdate: async () => { events.push("pause"); },
    onUpdateCancelled: async () => { events.push("restore"); },
  };
  const unregister = registerAudioSessionLifecycle("update-lifecycle-test", lifecycle);
  try {
    await prepareAudioForUpdate();
    assert.deepEqual(events, ["pause"]);
    await cancelAudioUpdatePreparation();
    assert.deepEqual(events, ["pause", "restore"]);
  } finally {
    unregister();
  }
});
