import assert from "node:assert/strict";
import test from "node:test";
import { HBGEventBus } from "./eventBus.ts";

test("HBG event bus publishes timestamped notifications asynchronously", async () => {
  const bus = new HBGEventBus();
  const received = [];
  bus.subscribe("hbg_core.test", (event) => received.push(event));

  bus.publish("hbg_core.test", { action: "music.play" });
  assert.equal(received.length, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(received.length, 1);
  const event = received[0];
  assert.equal(event.channel, "hbg_core.test");
  assert.deepEqual(event.payload, { action: "music.play" });
  assert.ok(Number.isFinite(Date.parse(event.timestamp)));
});

test("HBG event bus supports synchronous delivery for deterministic tests", () => {
  const bus = new HBGEventBus();
  let received = false;
  bus.subscribe("hbg_core.sync", () => { received = true; });
  bus.publishSync("hbg_core.sync", { ok: true });
  assert.equal(received, true);
});

test("HBG event bus unsubscribe removes empty channels", () => {
  const bus = new HBGEventBus();
  let calls = 0;
  const unsubscribe = bus.subscribe("hbg_core.lifecycle", () => { calls += 1; });
  assert.deepEqual(bus.getActiveChannels(), ["hbg_core.lifecycle"]);

  unsubscribe();
  bus.publishSync("hbg_core.lifecycle", {});
  assert.equal(calls, 0);
  assert.deepEqual(bus.getActiveChannels(), []);
});

test("HBG event bus rejects invalid channel names", () => {
  const bus = new HBGEventBus();
  assert.throws(() => bus.subscribe("  ", () => undefined));
  assert.throws(() => bus.publish("x".repeat(121), {}));
});
