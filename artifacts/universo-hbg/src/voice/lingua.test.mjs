import assert from "node:assert/strict";
import test from "node:test";
import { inspectUtterance, normalizeUtterance } from "./lingua.ts";

test("HBG LINGUA normalizes accents, punctuation and repeated spaces", () => {
  assert.equal(normalizeUtterance("  BÁJALE,   UN POQUITO!!! "), "bajale un poquito");
});

test("HBG LINGUA strips an invocation prefix from a transcript without claiming wake detection", () => {
  assert.equal(normalizeUtterance("Oye HBG, sube el volumen"), "sube el volumen");
  assert.deepEqual(inspectUtterance("Oye HBG, abre INSTINTO"), {
    raw: "Oye HBG, abre INSTINTO",
    text: "abre instinto",
    wakePhrasePresent: true,
  });
});

test("HBG LINGUA does not mistake an invocation phrase inside a sentence for activation", () => {
  assert.equal(inspectUtterance("ayer dije oye hbg").wakePhrasePresent, false);
});
