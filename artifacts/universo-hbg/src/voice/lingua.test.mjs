import assert from "node:assert/strict";
import test from "node:test";
import { inspectUtterance, interpretUtterance, normalizeUtterance } from "./lingua.ts";

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


test("HBG LINGUA classifies volume changes as persistent user intent", () => {
  const lower = interpretUtterance("Oye HBG, bájale un poquito");
  assert.equal(lower.action.type, "ADJUST_VOLUME");
  assert.equal(lower.effect, "persistent");
  assert.equal(lower.wakePhrasePresent, true);
  assert.equal(lower.requiresClarification, false);

  const exact = interpretUtterance("Oye HBG, pon el volumen al 45%");
  assert.deepEqual(exact.action, { type: "SET_VOLUME", volume: 45 });
  assert.equal(exact.effect, "persistent");
});

test("HBG LINGUA requests clarification instead of guessing unknown intent", () => {
  const result = interpretUtterance("haz algo con el audio");
  assert.equal(result.action.type, "UNKNOWN");
  assert.equal(result.effect, "unknown");
  assert.equal(result.requiresClarification, true);
});

test("HBG LINGUA prioritizes pause commands over song-title matching", () => {
  const phrases = [
    "Pausa",
    "Páusalo",
    "Pon pausa",
    "Pon en pausa",
    "Ponlo en pausa",
    "Ponla en pausa",
    "Detén la música",
    "Para la reproducción",
    "Oye HBG, páusalo",
  ];
  for (const phrase of phrases) {
    assert.deepEqual(
      interpretUtterance(phrase).action,
      { type: "PAUSE" },
      `Expected "${phrase}" to be classified as PAUSE`,
    );
  }
});

test("HBG LINGUA recognizes natural resume variants", () => {
  const phrases = [
    "Continúa",
    "Sigue reproduciendo",
    "Reanúdalo",
    "Reanúdala",
    "Quita la pausa",
  ];
  for (const phrase of phrases) {
    assert.deepEqual(
      interpretUtterance(phrase).action,
      { type: "RESUME" },
      `Expected "${phrase}" to be classified as RESUME`,
    );
  }
});

test("HBG LINGUA keeps named song requests as track searches after control priority", () => {
  assert.deepEqual(interpretUtterance("Pon Despacito").action, {
    type: "PLAY_TRACK",
    query: "despacito",
  });
});

test("HBG LINGUA routes INSTINTO idea requests with bounded context", () => {
  assert.deepEqual(
    interpretUtterance("Genera una idea sobre mi próximo proyecto").action,
    { type: "INSTINTO_IDEA", context: "mi próximo proyecto" },
  );
});

test("HBG LINGUA recognizes hook, chorus and rhyme draft requests", () => {
  for (const phrase of ["Dame un hook", "Prepara un coro", "Genera una rima"]) {
    assert.deepEqual(
      interpretUtterance(phrase).action,
      { type: "INSTINTO_HOOK" },
      `Expected "${phrase}" to route to INSTINTO`,
    );
  }
});
