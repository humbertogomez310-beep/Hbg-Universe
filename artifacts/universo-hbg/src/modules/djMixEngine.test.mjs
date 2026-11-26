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
