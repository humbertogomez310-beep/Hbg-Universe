import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeAudioBlob,
  analyzeDecodedAudio,
  downsampleAudioForAnalysis,
  estimateBpmFromSamples,
  estimateKeyFromSamples,
  scoreHarmonicCompatibility,
  scoreTempoCompatibility,
} from "./djAudioAnalysis.ts";

function tone(frequency, sampleRate = 44100, seconds = 12) {
  const samples = new Float32Array(Math.floor(sampleRate * seconds));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 0.35;
  }
  return samples;
}

test("harmonic scoring recognizes same key, adjacent Camelot keys and relative major/minor", () => {
  assert.equal(scoreHarmonicCompatibility("C major", "C major"), 1);
  assert.equal(scoreHarmonicCompatibility("C major", "G major"), 0.82);
  assert.equal(scoreHarmonicCompatibility("C major", "A minor"), 0.72);
  assert.equal(scoreHarmonicCompatibility("C major", "F# major"), 0.12);
  assert.equal(scoreHarmonicCompatibility(undefined, "C major"), 0);
});

test("tempo scoring accepts close tempos and half/double-time matches", () => {
  assert.equal(scoreTempoCompatibility(120, 120), 1);
  assert.equal(scoreTempoCompatibility(120, 60), 1);
  assert.ok(scoreTempoCompatibility(124, 120) > 0.5);
  assert.equal(scoreTempoCompatibility(120, 90), 0);
  assert.equal(scoreTempoCompatibility(undefined, 90), 0);
});

test("tempo analysis returns no fabricated BPM for silence or short clips", () => {
  assert.deepEqual(estimateBpmFromSamples(new Float32Array(44100), 44100), { bpm: null, confidence: 0, beatStrength: 0 });
  assert.deepEqual(estimateBpmFromSamples(new Float32Array(44100 * 4), 44100), { bpm: null, confidence: 0, beatStrength: 0 });
});

test("key analysis returns no fabricated key for silence", () => {
  assert.deepEqual(estimateKeyFromSamples(new Float32Array(44100 * 12), 44100), { musicalKey: null, confidence: 0 });
});

test("analysis downsamples to a bounded mono buffer without changing the source audio", () => {
  const source = new Float32Array(44100 * 95);
  source.fill(0.25);
  const prepared = downsampleAudioForAnalysis([source], 44100);
  assert.equal(prepared.sampleRate, 11025);
  assert.equal(prepared.samples.length, 11025 * 90);
  assert.ok(prepared.samples.every((sample) => Math.abs(sample - 0.25) < 1e-6));
  assert.equal(source.length, 44100 * 95);
});

test("decoded analysis records a timestamp and only emits detected values", () => {
  const result = analyzeDecodedAudio([tone(440)], 44100);
  assert.ok(typeof result.analyzedAt === "number");
  if ("bpm" in result) assert.ok(result.bpm > 0);
  if ("musicalKey" in result) assert.ok(typeof result.musicalKey === "string");
  if ("bpmConfidence" in result) assert.ok(result.bpmConfidence >= 0 && result.bpmConfidence <= 1);
  if ("keyConfidence" in result) assert.ok(result.keyConfidence >= 0 && result.keyConfidence <= 1);
  assert.ok(result.beatStrength !== undefined && result.beatStrength >= 0 && result.beatStrength <= 1);
  assert.ok(result.energyLevel !== undefined && result.energyLevel >= 0 && result.energyLevel <= 1);
  assert.ok(result.impactStrength !== undefined && result.impactStrength >= 0 && result.impactStrength <= 1);
});


test("tempo analysis estimates a regular 120 BPM pulse train", () => {
  const sampleRate = 44100;
  const seconds = 24;
  const samples = new Float32Array(sampleRate * seconds);
  const beatLength = Math.round(sampleRate * 0.5);
  for (let beat = 0; beat < seconds * 2; beat += 1) {
    const start = beat * beatLength;
    for (let index = 0; index < 700 && start + index < samples.length; index += 1) {
      const envelope = 1 - index / 700;
      samples[start + index] = Math.sin((2 * Math.PI * 110 * index) / sampleRate) * envelope * 0.8;
    }
  }
  const result = estimateBpmFromSamples(samples, sampleRate);
  assert.ok(result.bpm !== null);
  assert.ok(Math.abs(result.bpm - 120) <= 2, `expected around 120 BPM, received ${result.bpm}`);
  assert.ok(result.confidence > 0.25);
  assert.ok(result.beatStrength > 0.04);
});


test("blob analysis uses an offline 12 kHz context without opening a real-time audio context", async () => {
  const previous = globalThis.OfflineAudioContext;
  let constructorArgs;
  let receivedBuffer;
  class MockOfflineAudioContext {
    constructor(...args) { constructorArgs = args; }
    async decodeAudioData(buffer) {
      receivedBuffer = buffer;
      const samples = tone(440, 12000, 12);
      return {
        numberOfChannels: 1,
        sampleRate: 12000,
        duration: 12,
        getChannelData: () => samples,
      };
    }
  }
  globalThis.OfflineAudioContext = MockOfflineAudioContext;
  try {
    const result = await analyzeAudioBlob(new Blob(["audio"]), 12);
    assert.deepEqual(constructorArgs, [1, 1, 12000]);
    assert.ok(receivedBuffer instanceof ArrayBuffer);
    assert.ok(typeof result.analyzedAt === "number");
  } finally {
    if (previous === undefined) delete globalThis.OfflineAudioContext;
    else globalThis.OfflineAudioContext = previous;
  }
});

test("blob analysis skips recordings longer than 15 minutes before decoding", async () => {
  const previous = globalThis.OfflineAudioContext;
  let constructed = false;
  class MockOfflineAudioContext {
    constructor() { constructed = true; }
  }
  globalThis.OfflineAudioContext = MockOfflineAudioContext;
  try {
    await assert.rejects(
      analyzeAudioBlob(new Blob(["audio"]), 15 * 60 + 1),
      /supera 15 minutos/,
    );
    assert.equal(constructed, false);
  } finally {
    if (previous === undefined) delete globalThis.OfflineAudioContext;
    else globalThis.OfflineAudioContext = previous;
  }
});
