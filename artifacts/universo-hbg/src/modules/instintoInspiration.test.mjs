import assert from "node:assert/strict";
import test from "node:test";
import {
  generateInstintoHook,
  generateInstintoIdea,
  generateInstintoRhyme,
  generateInstintoVerse,
  getInstintoWritingPrompt,
  resolveInstintoMood,
} from "./instintoInspiration.ts";

test("INSTINTO maps HBG Core mood values to creative moods safely", () => {
  assert.equal(resolveInstintoMood("energia"), "energized");
  assert.equal(resolveInstintoMood("enfocado"), "focused");
  assert.equal(resolveInstintoMood("creativo"), "creative");
  assert.equal(resolveInstintoMood("relajado"), "relaxed");
  assert.equal(resolveInstintoMood("neutral"), "neutral");
  assert.equal(resolveInstintoMood("triste"), "neutral");
  assert.equal(resolveInstintoMood(undefined), "focused");
});

test("INSTINTO generates an idea for the selected mood and can use context", () => {
  const idea = generateInstintoIdea("focused", "Quiero mejorar mi código y mi proyecto", () => 0);
  assert.match(idea, /Mapa mental visual/);
  assert.match(idea, /código, proyecto/);
});

test("INSTINTO preserves familiar hooks while selecting by mood", () => {
  assert.match(generateInstintoHook("energized", () => 0), /El fuego no se apaga/);
  assert.match(generateInstintoHook("creative", () => 0), /Del caos nace la obra maestra/);
});

test("INSTINTO generates a rhyme using a supplied seed word", () => {
  assert.equal(
    generateInstintoRhyme("universo", "creative", () => 0),
    "universo nace del alma / en la tormenta hay calma",
  );
});

test("INSTINTO generates a bounded verse using topic keywords", () => {
  const verse = generateInstintoVerse("código y visión", "focused", 2, () => 0);
  assert.equal(verse.split("\n").length, 2);
  assert.match(verse, /código/);
  assert.match(verse, /visión/);
  assert.equal(generateInstintoVerse("alma", "neutral", 99, () => 0).split("\n").length, 8);
});

test("INSTINTO provides a mood-aware writing prompt", () => {
  assert.equal(
    getInstintoWritingPrompt("relaxed"),
    "¿Qué simplicidad te ha dado más valor en la vida?",
  );
});
