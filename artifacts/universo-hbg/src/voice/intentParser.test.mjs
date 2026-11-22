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
  assert.deepEqual(parseIntent("pon volumen a 75%"), { type: "SET_VOLUME", volume: 75 });
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
