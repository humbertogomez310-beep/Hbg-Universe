import assert from "node:assert/strict";
import test from "node:test";
import {
  VOICE_RESPONSE_DISMISS_MS,
  clampVoiceWidgetPosition,
  isPersistentVoiceError,
  readVoiceWidgetPosition,
} from "./voiceCommandUi.ts";

test("voice widget position stays inside small and large viewports", () => {
  assert.deepEqual(
    clampVoiceWidgetPosition({ x: 900, y: 900 }, { width: 400, height: 800 }),
    { x: 288, y: 728 },
  );
  assert.deepEqual(
    clampVoiceWidgetPosition({ x: -20, y: -10 }, { width: 80, height: 60 }),
    { x: 8, y: 8 },
  );
});

test("voice widget restores valid coordinates and clamps stale viewport values", () => {
  assert.deepEqual(
    readVoiceWidgetPosition('{"x":40,"y":50}', { width: 400, height: 800 }),
    { x: 40, y: 50 },
  );
  assert.deepEqual(
    readVoiceWidgetPosition('{"x":900,"y":900}', { width: 400, height: 800 }),
    { x: 288, y: 728 },
  );
});

test("invalid stored voice widget coordinates use a safe default", () => {
  assert.deepEqual(
    readVoiceWidgetPosition('{"x":"left","y":null}', { width: 400, height: 800 }),
    { x: 284, y: 644 },
  );
  assert.deepEqual(
    readVoiceWidgetPosition("not-json", { width: 400, height: 800 }),
    { x: 284, y: 644 },
  );
});

test("normal voice confirmations dismiss after three seconds while errors persist", () => {
  assert.equal(VOICE_RESPONSE_DISMISS_MS, 3000);
  assert.equal(isPersistentVoiceError("Reproduciendo."), false);
  assert.equal(isPersistentVoiceError("Objetivo musical actualizado: romántica."), false);
  assert.equal(isPersistentVoiceError("No se pudo reproducir."), true);
  assert.equal(isPersistentVoiceError("No entendí el comando."), true);
  assert.equal(isPersistentVoiceError("Esa operación requiere una sesión autorizada."), true);
});
