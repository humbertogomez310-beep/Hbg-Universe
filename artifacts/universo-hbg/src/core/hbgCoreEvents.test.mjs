import assert from "node:assert/strict";
import test from "node:test";
import { HBGCore, HBG_CORE_EVENTS } from "./hbgCore.ts";

test("HBG Core emits action requested and succeeded lifecycle events", async () => {
  const core = new HBGCore();
  const requested: Array<{ payload: Record<string, unknown> }> = [];
  const succeeded: Array<{ payload: Record<string, unknown> }> = [];

  core.subscribeEvent(HBG_CORE_EVENTS.ACTION_REQUESTED, (event) => requested.push(event));
  core.subscribeEvent(HBG_CORE_EVENTS.ACTION_SUCCEEDED, (event) => succeeded.push(event));
  core.registerAction("music.play", () => ({
    success: true,
    data: { internalValue: "must-not-enter-event" },
  }));

  const result = await core.dispatchAction("music.play", { privateInput: "must-not-enter-event" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(result.success, true);
  assert.equal(requested.length, 1);
  assert.deepEqual(requested[0].payload, { action: "music.play" });
  assert.equal(succeeded.length, 1);
  assert.deepEqual(succeeded[0].payload, {
    action: "music.play",
    requestId: result.requestId,
  });
  assert.equal(JSON.stringify([...requested, ...succeeded]).includes("must-not-enter-event"), false);
});

test("HBG Core emits a failed lifecycle event with a safe error code", async () => {
  const core = new HBGCore();
  const failed: Array<{ payload: Record<string, unknown> }> = [];
  core.subscribeEvent(HBG_CORE_EVENTS.ACTION_FAILED, (event) => failed.push(event));
  core.registerAction("music.pause", () => ({
    success: false,
    error: "Private handler detail",
    code: "TEST_FAILURE",
  }));

  const result = await core.dispatchAction("music.pause");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(result.success, false);
  assert.equal(failed.length, 1);
  assert.deepEqual(failed[0].payload, {
    action: "music.pause",
    requestId: result.requestId,
    code: "TEST_FAILURE",
  });
  assert.equal(JSON.stringify(failed).includes("Private handler detail"), false);
});

test("HBG Core exposes active event channels and unsubscribe", () => {
  const core = new HBGCore();
  const unsubscribe = core.subscribeEvent("hbg_core.test", () => undefined);
  assert.deepEqual(core.getActiveEventChannels(), ["hbg_core.test"]);
  unsubscribe();
  assert.deepEqual(core.getActiveEventChannels(), []);
});
