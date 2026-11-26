import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeDecodedAudio,
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
