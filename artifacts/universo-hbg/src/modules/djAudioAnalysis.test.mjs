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
  assert.deepEqual(estimateBpmFromSamples(new Float32Array(44100), 44100), { bpm: null, confidence: 0 });
  assert.deepEqual(estimateBpmFromSamples(new Float32Array(44100 * 4), 44100), { bpm: null, confidence: 0 });
});

test("key analysis returns no fabricated key for silence", () => {
  assert.deepEqual(estimateKeyFromSamples(new Float32Array(44100 * 12), 44100), { musicalKey: null, confidence: 0 });
});

test("decoded analysis records a timestamp and only emits detected values", () => {
  const result = analyzeDecodedAudio([tone(440)], 44100);
  assert.ok(typeof result.analyzedAt === "number");
  assert.ok(!("bpm" in result));
  assert.ok(typeof result.musicalKey === "string" || !("musicalKey" in result));
});
