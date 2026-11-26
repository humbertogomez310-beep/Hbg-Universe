import assert from "node:assert/strict";
import test from "node:test";
import { createEqualPowerCrossfadeCurves } from "./djMixEngine.ts";

test("two-deck crossfade starts and ends on the correct deck", () => {
  const { outgoing, incoming } = createEqualPowerCrossfadeCurves(5);
  assert.equal(outgoing[0], 1);
  assert.equal(incoming[0], 0);
  assert.ok(outgoing[4] < 0.000001);
  assert.equal(incoming[4], 1);
});

test("equal-power crossfade maintains approximately constant combined power", () => {
  const { outgoing, incoming } = createEqualPowerCrossfadeCurves(128);
  for (let index = 0; index < outgoing.length; index += 1) {
    const power = outgoing[index] ** 2 + incoming[index] ** 2;
    assert.ok(Math.abs(power - 1) < 0.00001);
  }
});

test("crossfade curve supports a bounded minimum number of steps", () => {
  const curves = createEqualPowerCrossfadeCurves(0);
  assert.equal(curves.outgoing.length, 2);
  assert.equal(curves.incoming.length, 2);
});

class FakeAudioParam {
  value = 1;
  cancelScheduledValues() {}
  setValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
  setValueCurveAtTime(curve) { this.value = curve[curve.length - 1]; }
}

class FakeGainNode {
  gain = new FakeAudioParam();
  connect() {}
  disconnect() {}
}

class FakeAudioElement {
  preload = "none";
  src = "";
  currentTime = 0;
  duration = 60;
  paused = true;
  ended = false;
  listeners = new Map();
  addEventListener(name, callback) {
    const list = this.listeners.get(name) ?? new Set();
    list.add(callback);
    this.listeners.set(name, list);
  }
  removeEventListener(name, callback) {
    this.listeners.get(name)?.delete(callback);
  }
  dispatch(name) {
    for (const callback of this.listeners.get(name) ?? []) callback();
  }
  load() {
    if (this.src) queueMicrotask(() => this.dispatch("canplay"));
  }
  async play() {
    this.paused = false;
    this.ended = false;
    this.dispatch("play");
  }
  pause() {
    if (!this.paused) {
      this.paused = true;
      this.dispatch("pause");
    }
  }
  removeAttribute(name) {
    if (name === "src") this.src = "";
  }
}

class FakeAudioContext {
  currentTime = 0;
  state = "running";
  destination = {};
  createGain() { return new FakeGainNode(); }
  createMediaElementSource() { return { connect() {}, disconnect() {} }; }
  async resume() { this.state = "running"; }
}

test("two-deck engine preloads and crossfades without pausing the outgoing track", async () => {
  const { VibraDjMixEngine } = await import("./djMixEngine.ts");
  const previousAudio = globalThis.Audio;
  globalThis.Audio = FakeAudioElement;
  const engine = new VibraDjMixEngine(new FakeAudioContext());
  try {
    const active = await engine.loadActive(new Blob(["track A"]), 0, true);
    assert.ok(active);
    assert.equal(engine.activeDeck, "A");
    assert.equal(active.paused, false);

    assert.equal(await engine.prepareNext(new Blob(["track B"])), true);
    const outgoing = engine.activeAudio;
    const incoming = engine.incomingAudio;
    assert.equal(incoming.paused, true);

    assert.equal(await engine.crossfadeToNext(500), true);
    assert.equal(engine.activeDeck, "B");
    assert.equal(outgoing.paused, false);
    assert.equal(incoming.paused, false);
    assert.equal(engine.isTransitioning, true);

    await new Promise((resolve) => setTimeout(resolve, 560));
    assert.equal(outgoing.paused, true);
    assert.equal(incoming.paused, false);
    assert.equal(engine.isTransitioning, false);
  } finally {
    engine.destroy();
    globalThis.Audio = previousAudio;
  }
});

test("manual load and pause cancel an incoming deck and preserve one active transport", async () => {
  const { VibraDjMixEngine } = await import("./djMixEngine.ts");
  const previousAudio = globalThis.Audio;
  globalThis.Audio = FakeAudioElement;
  const engine = new VibraDjMixEngine(new FakeAudioContext());
  try {
    const first = await engine.loadActive(new Blob(["first"]), 0, true);
    assert.ok(first);
    assert.equal(await engine.prepareNext(new Blob(["next"])), true);
    engine.pauseAll();
    assert.equal(engine.activeAudio.paused, true);
    assert.equal(engine.incomingAudio.src, "");

    const replacement = await engine.loadActive(new Blob(["replacement"]), 0, true);
    assert.ok(replacement);
    assert.equal(engine.activeAudio.paused, false);
    assert.equal(engine.incomingAudio.src, "");
  } finally {
    engine.destroy();
    globalThis.Audio = previousAudio;
  }
});
