import assert from "node:assert/strict";
import test from "node:test";
import { hbgCore } from "../core/hbgCore.ts";
import { executeVoiceAction } from "./actionExecutor.ts";

test("global voice executor navigates to public modules", async () => {
  const result = await executeVoiceAction({ type: "NAVIGATE", module: "instinto" });
  assert.equal(hbgCore.getModule(), "instinto");
  assert.match(result, /INSTINTO/i);
  hbgCore.setModule("universo");
});

test("global voice executor explains capabilities and module information", async () => {
  const capabilities = await executeVoiceAction({ type: "CAPABILITIES" });
  assert.match(capabilities, /INSTINTO/);
  assert.match(capabilities, /VIBRA/);

  const info = await executeVoiceAction({ type: "APP_INFO", module: "vibra" });
  assert.match(info, /VIBRA/i);
});

test("global voice executor opens INSTINTO without claiming it created a lyric", async () => {
  const result = await executeVoiceAction({ type: "CREATE_SONG", title: "La Voz del Lobo" });
  assert.equal(hbgCore.getModule(), "instinto");
  assert.match(result, /todavía no se ha creado/i);
  hbgCore.setModule("universo");
});

test("global voice executor refuses development operations in use mode", async () => {
  hbgCore.setModule("universo");
  const result = await executeVoiceAction({ type: "BLOCKED_DEVELOPMENT" });
  assert.match(result, /sesión de desarrollo autorizada/i);
  assert.equal(hbgCore.getModule(), "universo");
});

test("voice shuffle and repeat commands dispatch to the registered VIBRA actions", async () => {
  const received = [];
  const removeShuffle = hbgCore.registerAction("music.shuffle", (payload) => {
    received.push({ action: "shuffle", payload });
    return { success: true };
  });
  const removeRepeat = hbgCore.registerAction("music.repeat", (payload) => {
    received.push({ action: "repeat", payload });
    return { success: true };
  });

  try {
    assert.match(
      await executeVoiceAction({ type: "SET_SHUFFLE", value: true }),
      /aleatorio activado/i,
    );
    assert.match(
      await executeVoiceAction({ type: "SET_REPEAT", value: true }),
      /repetición activada/i,
    );
    assert.deepEqual(received, [
      { action: "shuffle", payload: { enabled: true } },
      { action: "repeat", payload: { mode: "all" } },
    ]);
  } finally {
    removeShuffle();
    removeRepeat();
  }
});
