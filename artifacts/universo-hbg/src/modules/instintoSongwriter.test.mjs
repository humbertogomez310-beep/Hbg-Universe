import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInstintoSongPrompt,
  generateInstintoLocalSongScaffold,
  parseInstintoSongSections,
} from "./instintoSongwriter.ts";

test("songwriter prompt validates bounded user input and starts directly with narrative lyrics", () => {
  assert.throws(() => buildInstintoSongPrompt({ concept: "corto" }), /al menos 8/);
  const prompt = buildInstintoSongPrompt({
    title: "Volver",
    concept: "Una persona reconstruye su vida después de una caída",
    genre: "pop rock",
  });
  assert.match(prompt, /NO escribas una introducción separada/);
  assert.match(prompt, /No imites la voz/);
  assert.match(prompt, /pop rock/);
});

test("songwriter parser converts headings to editable sections and folds INTRO into verse", () => {
  const sections = parseInstintoSongSections(
    "[INTRO]\nLa calle despierta\n[VERSO 1]\nCamino sin mirar atrás\n[CORO]\nVoy a comenzar",
  );
  assert.deepEqual(sections.map((section) => section.type), ["verso", "coro"]);
  assert.match(sections[0].content, /La calle despierta/);
  assert.match(sections[0].content, /Camino sin mirar atrás/);
});

test("songwriter parser safely handles plain text and rejects empty output", () => {
  const sections = parseInstintoSongSections("Una canción sin encabezados.");
  assert.equal(sections.length, 1);
  assert.equal(sections[0].type, "verso");
  assert.throws(() => parseInstintoSongSections("  "), /vacía/);
});

test("offline songwriter scaffold starts with a verse and never creates a separate intro", () => {
  const sections = generateInstintoLocalSongScaffold({
    concept: "un viaje para recuperar la confianza",
    genre: "balada",
  });
  assert.equal(sections[0].type, "verso");
  assert.equal(sections.some((section) => (section.type as string) === "intro"), false);
  assert.ok(sections.some((section) => section.type === "coro"));
  assert.ok(sections.some((section) => section.type === "puente"));
});
