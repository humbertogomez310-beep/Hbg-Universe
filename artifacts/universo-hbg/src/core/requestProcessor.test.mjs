import assert from "node:assert/strict";
import test from "node:test";
import { HBGRequestProcessor } from "./requestProcessor.ts";

test("pending HBG actions time out instead of remaining queued forever", async () => {
  const processor = new HBGRequestProcessor(10);
  const result = await processor.dispatchAction("music.play");
  assert.equal(result.success, false);
  assert.equal(result.code, "ACTION_TIMEOUT");
  assert.equal(processor.getPendingRequests().length, 0);
});

test("pending HBG actions are dispatched when their handler registers", async () => {
  const processor = new HBGRequestProcessor(1000);
  const pending = processor.dispatchAction("music.pause", { source: "test" });
  processor.registerAction("music.pause", async (payload) => ({
    success: true,
    data: { source: payload?.source },
  }));
  const result = await pending;
  assert.equal(result.success, true);
  assert.deepEqual(result.data, { source: "test" });
});

test("pending HBG actions can be cancelled explicitly", async () => {
  const processor = new HBGRequestProcessor(1000);
  const pending = processor.dispatchAction("music.next");
  assert.equal(processor.cancelPending(), 1);
  const result = await pending;
  assert.equal(result.success, false);
  assert.equal(result.code, "ACTION_CANCELLED");
});
