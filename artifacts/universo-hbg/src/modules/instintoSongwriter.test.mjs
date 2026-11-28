import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInstintoSongPrompt,
  generateInstintoLocalSongScaffold,
  parseInstintoSongSections,
} from "./instintoSongwriter.ts";

test("songwriter prompt validates bounded input and starts with narrative lyrics", () => {
  assert.throws(() => buildInstintoSongPrompt({ concept: "corto" }), /al menos 8/);
  const prompt = buildInstintoSongPrompt({
    title: "Volver",
    concept: "Una persona reconstruye su vida después de una caída",
    genre: "pop rock",
  });
  assert.match(prompt, /NO escribas una introducción separada/);
  assert.match(prompt, /No imites la voz/);
  assert.match(prompt, /H\.\.\. B\.\.\. G\.\.\./);
  assert.match(prompt, /pop rock/);
  assert.match(prompt, /IDEA_USUARIO/);
});

test("songwriter parser folds an explicit INTRO into the first verse", () => {
  const sections = parseInstintoSongSections("[INTRO]\nLa calle despierta\n[VERSO 1]\nCamino sin mirar atrás\n[CORO]\nVoy a comenzar");
  assert.deepEqual(sections.map((section) => section.type), ["verso", "coro"]);
  assert.match(sections[0].content, /La calle despierta/);
  assert.match(sections[0].content, /Camino sin mirar atrás/);
});

test("songwriter parser preserves distinct verse boundaries", () => {
  const sections = parseInstintoSongSections("[VERSO 1]\nPrimera parte\n[CORO]\nEstribillo\n[VERSO 2]\nSegunda parte\n[PUENTE]\nCambio\n[CORO FINAL]\nCierre");
  assert.deepEqual(sections.map((section) => section.type), ["verso", "coro", "verso", "puente", "coro"]);
  assert.match(sections[2].content, /Segunda parte/);
});

test("songwriter parser handles plain text and rejects empty output", () => {
  assert.equal(parseInstintoSongSections("Una canción sin encabezados.")[0].type, "verso");
  assert.throws(() => parseInstintoSongSections("  "), /vacía/);
});

test("offline scaffold starts with a verse, includes sections and preserves HBG signature", () => {
  const sections = generateInstintoLocalSongScaffold({ concept: "un viaje para recuperar la confianza", genre: "balada" });
  assert.equal(sections[0].type, "verso");
  assert.equal(sections.some((section) => (section.type as string) === "intro"), false);
  assert.ok(sections.some((section) => section.type === "coro"));
  assert.ok(sections.some((section) => section.type === "puente"));
  assert.ok(sections.some((section) => section.content.includes("H... B... G...")));
});
