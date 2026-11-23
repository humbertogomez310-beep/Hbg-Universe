import assert from "node:assert/strict";
import test from "node:test";
import { parseIntent } from "./intentParser.ts";

test("HBG Core recognizes greetings and capability requests", () => {
  assert.deepEqual(parseIntent("hola"), { type: "GREETING" });
  assert.deepEqual(parseIntent("capacidades"), { type: "CAPABILITIES" });
});

test("HBG Core navigates only to known public modules", () => {
  assert.deepEqual(parseIntent("abre Instinto"), { type: "NAVIGATE", module: "instinto" });
  assert.deepEqual(parseIntent("abre un módulo desconocido"), { type: "UNKNOWN", raw: "abre un módulo desconocido" });
});

test("HBG Core routes music commands to concrete actions", () => {
  assert.deepEqual(parseIntent("pausa"), { type: "PAUSE" });
  assert.deepEqual(parseIntent("siguiente canción"), { type: "NEXT" });
  assert.deepEqual(parseIntent("activa modo fiesta"), { type: "SET_MOOD", mood: "party" });
  assert.deepEqual(parseIntent("activa modo creativo"), { type: "SET_MOOD", mood: "creative" });
  assert.deepEqual(parseIntent("pon volumen a 75%"), { type: "SET_VOLUME", volume: 75 });
  assert.deepEqual(parseIntent("activa el aleatorio"), { type: "SET_SHUFFLE", value: true });
  assert.deepEqual(parseIntent("desactiva la repetición"), { type: "SET_REPEAT", value: false });
});

test("HBG Core refuses development and deployment instructions in use mode", () => {
  assert.deepEqual(parseIntent("modifica el código y despliega"), { type: "BLOCKED_DEVELOPMENT" });
});

test("HBG Core does not fabricate an intent for unsupported conversation", () => {
  assert.deepEqual(parseIntent("qué opinas de esta situación"), {
    type: "UNKNOWN",
    raw: "qué opinas de esta situación",
  });
});

test("VIBRA recognizes natural variations for starting music playback", () => {
  const phrases = [
    "pon música",
    "ponme música",
    "reproduce música",
    "quiero escuchar música",
    "quiero oír algo",
    "me gustaría escuchar una canción",
    "pon algo de música",
    "haz sonar la música",
    "que suene una canción",
    "vamos a escuchar música",
    "empieza la música",
    "arranca música",
    "dale play",
    "pon play",
    "play",
  ];

  for (const phrase of phrases) {
    assert.deepEqual(parseIntent(phrase), { type: "PLAY" }, phrase);
  }
});

test("VIBRA keeps named music requests and musical direction distinct from generic play", () => {
  assert.deepEqual(parseIntent("pon Bohemian Rhapsody"), {
    type: "PLAY_TRACK",
    query: "bohemian rhapsody",
  });
  assert.deepEqual(parseIntent("pon música romántica"), {
    type: "SET_DIRECTION",
    text: "pon música romántica",
  });
});

test("VIBRA recognizes conversational pause and resume variations", () => {
  for (const phrase of ["pon en pausa", "detén la música", "para la música"]) {
    assert.deepEqual(parseIntent(phrase), { type: "PAUSE" }, phrase);
  }
  for (const phrase of ["sigue", "continúa la música", "reanuda la reproducción", "retoma"]) {
    assert.deepEqual(parseIntent(phrase), { type: "RESUME" }, phrase);
  }
});


test("HBG voice distinguishes persistent absolute volume changes from relative adjustments", () => {
  assert.deepEqual(parseIntent("pon volumen a 50%"), { type: "SET_VOLUME", volume: 50 });
  assert.deepEqual(parseIntent("sube el volumen a 65"), { type: "SET_VOLUME", volume: 65 });
  assert.deepEqual(parseIntent("baja volumen a 20%"), { type: "SET_VOLUME", volume: 20 });
  assert.deepEqual(parseIntent("sube el volumen"), { type: "ADJUST_VOLUME", delta: 10 });
  assert.deepEqual(parseIntent("Oye HBG, sube el volumen"), { type: "ADJUST_VOLUME", delta: 10 });
  assert.deepEqual(parseIntent("bájale un poquito"), { type: "ADJUST_VOLUME", delta: -5 });
  assert.deepEqual(parseIntent("baja el volumen bastante"), { type: "ADJUST_VOLUME", delta: -20 });
  assert.deepEqual(parseIntent("dale más fuerte"), { type: "ADJUST_VOLUME", delta: 10 });
  assert.deepEqual(parseIntent("dale más volumen"), { type: "ADJUST_VOLUME", delta: 10 });
  assert.deepEqual(parseIntent("más bajito"), { type: "ADJUST_VOLUME", delta: -10 });
  assert.deepEqual(parseIntent("baja el sonido"), { type: "ADJUST_VOLUME", delta: -10 });
  assert.deepEqual(parseIntent("ponlo más bajo"), { type: "ADJUST_VOLUME", delta: -10 });
  assert.deepEqual(parseIntent("sube el audio"), { type: "ADJUST_VOLUME", delta: 10 });
  assert.deepEqual(parseIntent("hazlo más fuerte"), { type: "ADJUST_VOLUME", delta: 10 });
  assert.deepEqual(parseIntent("sube el volumen a 120%"), {
    type: "UNKNOWN",
    raw: "sube el volumen a 120%",
  });
});
