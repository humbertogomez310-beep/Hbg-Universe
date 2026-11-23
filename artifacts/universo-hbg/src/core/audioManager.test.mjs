import assert from "node:assert/strict";
import test from "node:test";
import {
  beginVoiceAudioSession,
  getCurrentAudioDuckingFactor,
  registerAudioOutput,
} from "./audioManager.ts";

test("HBG audio manager ducks registered outputs and restores their prior level", () => {
  const factors = [];
  const unregister = registerAudioOutput("test-output", (factor) => factors.push(factor));
  try {
    assert.equal(getCurrentAudioDuckingFactor(), 1);
    const release = beginVoiceAudioSession();
    assert.equal(getCurrentAudioDuckingFactor(), 0.25);
    release();
    assert.equal(getCurrentAudioDuckingFactor(), 1);
    assert.deepEqual(factors, [1, 0.25, 1]);
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
    assert.equal(getCurrentAudioDuckingFactor(), 0.25);
    releaseSecond();
    assert.equal(getCurrentAudioDuckingFactor(), 1);
    assert.deepEqual(factors, [1, 0.25, 0.25, 1]);
  } finally {
    unregister();
  }
});

test("voice session release is idempotent and a late output receives current ducking", () => {
  const release = beginVoiceAudioSession();
  const factors = [];
  const unregister = registerAudioOutput("late-output", (factor) => factors.push(factor));
  try {
    assert.equal(getCurrentAudioDuckingFactor(), 0.25);
    assert.deepEqual(factors, [0.25]);
    release();
    release();
    assert.deepEqual(factors, [0.25, 1]);
  } finally {
    unregister();
  }
});
