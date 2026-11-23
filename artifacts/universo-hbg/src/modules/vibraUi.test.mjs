import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./vibra.tsx", import.meta.url), "utf8");

test("DJ VIBRA has its own navigation view", () => {
  assert.match(source, /type ViewMode = [^;]*"dj"/);
  assert.match(source, /\{ id: "dj", label: "DJ VIBRA" \}/);
});

test("musical direction and Auto DJ controls are isolated to DJ VIBRA", () => {
  const panelIndex = source.indexOf('aria-label="Dirección musical"');
  const djGateIndex = source.lastIndexOf('{view === "dj" && (', panelIndex);
  const panelCloseIndex = source.indexOf("</section>", panelIndex);
  const gateCloseIndex = source.indexOf("      )}", panelCloseIndex);
  const playerIndex = source.indexOf('{/* PLAYER */}');
  assert.ok(panelIndex >= 0, "direction panel exists");
  assert.ok(djGateIndex >= 0 && djGateIndex < panelIndex, "direction panel is gated by DJ view");
  assert.ok(panelCloseIndex > panelIndex && gateCloseIndex > panelCloseIndex, "DJ panel closes inside its conditional");
  assert.ok(gateCloseIndex < playerIndex, "DJ panel closes before player view");
});

test("other VIBRA screens retain compact playback controls", () => {
  assert.match(source, /view !== "player" && currentTrack/);
  assert.match(source, /aria-label="Reproductor compacto"/);
  assert.match(source, /onClick=\{togglePlay\}/);
});
