import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./vibra.tsx", import.meta.url), "utf8");

test("DJ VIBRA has its own navigation view", () => {
  assert.match(source, /type ViewMode = [^;]*"dj"/);
  assert.match(source, /\{ id: "dj", label: "DJ VIBRA" \}/);
});

test("Auto DJ and Fiesta PRO share one DJ console", () => {
  const panelIndex = source.indexOf('aria-label="Consola DJ VIBRA"');
  const djGateIndex = source.lastIndexOf('{view === "dj" && (', panelIndex);
  const panelCloseIndex = source.indexOf("</section>", panelIndex);
  const gateCloseIndex = source.indexOf("      )}", panelCloseIndex);
  const playerIndex = source.indexOf('{/* PLAYER */}');
  assert.ok(panelIndex >= 0, "unified DJ console exists");
  assert.ok(djGateIndex >= 0 && djGateIndex < panelIndex, "console is gated by DJ view");
  assert.ok(panelCloseIndex > panelIndex && gateCloseIndex > panelCloseIndex, "console closes inside its conditional");
  assert.ok(gateCloseIndex < playerIndex, "console closes before player view");
  assert.match(source, /AUTO DJ/);
  assert.match(source, /FIESTA PRO/);
  assert.match(source, /<VisualizerBars active=\{isPlaying\}/);
});

test("voice and HBG Core activation open the shared DJ console", () => {
  assert.match(source, /registerAction\("music\.autoDj"[\s\S]*?if \(enabled\) setView\("dj"\)/);
  assert.match(source, /registerAction\("music\.party"[\s\S]*?setView\("dj"\)/);
});

test("other VIBRA screens retain compact playback controls", () => {
  assert.match(source, /view !== "player" && currentTrack/);
  assert.match(source, /aria-label="Reproductor compacto"/);
  assert.match(source, /onClick=\{togglePlay\}/);
});

test("Auto DJ seek controls stay beside the upper player panel", () => {
  const stageIndex = source.indexOf('<div className="vibra-dj-stage">');
  const stageTopEnd = source.indexOf('</div>', source.indexOf('<div className="vibra-dj-stage-top">', stageIndex)) + '</div>'.length;
  const seekIndex = source.indexOf('aria-label="Avance y retroceso de Auto DJ"', stageTopEnd);
  const spectrumIndex = source.indexOf('<div className="vibra-dj-spectrum">', stageTopEnd);
  assert.ok(stageIndex >= 0, "DJ stage exists");
  assert.ok(stageTopEnd > stageIndex, "player header exists");
  assert.ok(seekIndex > stageTopEnd && seekIndex < spectrumIndex, "seek controls are immediately below the player header, before the visualizer");
  assert.match(source, /Mantén presionado para avanzar o retroceder continuamente/);
});
