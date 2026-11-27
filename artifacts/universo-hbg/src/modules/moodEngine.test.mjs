import assert from "node:assert/strict";
import test from "node:test";
import { classifyTrackMoods } from "./moodEngine.ts";

const base = {
  title: "Track", artist: "", album: "", bpm: 128, bpmConfidence: 0.8,
  beatStrength: 0.8, energyLevel: 0.82, impactStrength: 0.7,
  musicalKey: "C major", keyConfidence: 0.8,
};

test("local measurable audio features create energetic mood candidates", () => {
  const scores = classifyTrackMoods(base);
  assert.ok((scores.happy ?? 0) >= 0.3);
  assert.ok((scores.party ?? 0) >= 0.3);
  assert.ok((scores.dance ?? 0) >= 0.3);
});

test("minor key and lower energy can contribute a sad mood candidate", () => {
  const scores = classifyTrackMoods({
    ...base, bpm: 72, energyLevel: 0.32, impactStrength: 0.1,
    musicalKey: "A minor",
  });
  assert.ok((scores.sad ?? 0) >= 0.3);
  assert.ok((scores.chill ?? 0) >= 0.3);
});

test("scenario tags are assigned only from local metadata text", () => {
  const scores = classifyTrackMoods({ ...base, title: "Cumpleaños infantil karaoke" });
  assert.ok((scores.birthday ?? 0) > 0.9);
  assert.ok((scores.kids ?? 0) > 0.9);
  assert.ok((scores.sing ?? 0) > 0.8);
});

test("classification is local and does not mutate source metadata", () => {
  const input = { ...base, title: "Ambient instrumental" };
  const before = structuredClone(input);
  classifyTrackMoods(input);
  assert.deepEqual(input, before);
});
