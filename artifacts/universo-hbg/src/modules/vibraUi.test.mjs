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

test("Auto DJ has fixed 10-second back/play/forward controls above the visualizer", () => {
  const stageIndex = source.indexOf('<div className="vibra-dj-stage">');
  const stageTopEnd = source.indexOf('</div>', source.indexOf('<div className="vibra-dj-stage-top">', stageIndex)) + '</div>'.length;
  const controlsIndex = source.indexOf('aria-label="Controles de reproducción y navegación de Auto DJ"', stageTopEnd);
  const spectrumIndex = source.indexOf('<div className="vibra-dj-spectrum">', stageTopEnd);
  const controls = source.slice(controlsIndex, spectrumIndex);
  assert.ok(stageIndex >= 0, "DJ stage exists");
  assert.ok(stageTopEnd > stageIndex, "player header exists");
  assert.ok(controlsIndex > stageTopEnd && controlsIndex < spectrumIndex, "transport controls stay directly below the player header and before the visualizer");
  assert.match(controls, /aria-label="Retroceder 10 segundos"/);
  assert.match(controls, /aria-label=\{isPlaying \? "Pausar música" : "Reproducir música"\}/);
  assert.match(controls, /aria-label="Adelantar 10 segundos"/);
  assert.ok(controls.indexOf('aria-label="Retroceder 10 segundos"') < controls.indexOf('aria-label={isPlaying ? "Pausar música" : "Reproducir música"}'));
  assert.ok(controls.indexOf('aria-label={isPlaying ? "Pausar música" : "Reproducir música"}') < controls.indexOf('aria-label="Adelantar 10 segundos"'));
  assert.match(controls, /startAutoDjSeekHold\(-1\)/);
  assert.match(controls, /startAutoDjSeekHold\(1\)/);
  assert.match(controls, /Un toque salta 10 segundos; mantén presionado para repetir saltos de 10 segundos/);
  assert.doesNotMatch(controls, /PASO:|5 SEG|autoDjSeekStep/);
  assert.doesNotMatch(source.slice(source.indexOf('<div className="vibra-dj-controls">'), source.indexOf('</div>', source.indexOf('<div className="vibra-dj-controls">'))), /REPRODUCIR|PAUSAR/);
});
