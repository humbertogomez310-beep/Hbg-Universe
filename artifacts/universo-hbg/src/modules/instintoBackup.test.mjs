import assert from "node:assert/strict";
import test from "node:test";
import { createInstintoBackup, parseInstintoBackup } from "./instintoBackup.ts";

const sample = () => createInstintoBackup(
  [{
    id: "note-1",
    title: "Idea",
    content: "Contenido de prueba",
    category: "ideas",
    createdAt: "2026-11-22T10:00:00.000Z",
    updatedAt: "2026-11-22T10:00:00.000Z",
    pinned: false,
    favorite: true,
    tags: ["hbg"],
    deleted: true,
  }],
  [{
    id: "lyric-1",
    title: "Canción",
    sections: [{ id: "section-1", type: "verso", content: "Una línea" }],
    createdAt: "2026-11-22T10:00:00.000Z",
    updatedAt: "2026-11-22T10:00:00.000Z",
  }],
  [{
    id: "project-1",
    name: "Proyecto",
    description: "Descripción",
    status: "en_progreso",
    color: "var(--neon-cyan)",
    createdAt: "2026-11-22T10:00:00.000Z",
  }],
  { title: "Borrador", content: "Sin terminar", category: "notas", tags: ["draft"] },
  "2026-11-22T11:00:00.000Z",
);

test("INSTINTO backup preserves notes including trash, lyrics, projects, and draft", () => {
  const backup = parseInstintoBackup(sample());
  assert.equal(backup.notes.length, 1);
  assert.equal(backup.notes[0].deleted, true);
  assert.equal(backup.lyrics[0].sections[0].content, "Una línea");
  assert.equal(backup.projects[0].status, "en_progreso");
  assert.equal(backup.draft.content, "Sin terminar");
});

test("INSTINTO backup rejects unknown versions and malformed collection entries", () => {
  const backup = sample();
  assert.throws(() => parseInstintoBackup({ ...backup, format: "old-format" }), /respaldo válido/i);
  assert.throws(() => parseInstintoBackup({ ...backup, notes: [{ id: "../escape" }] }), /respaldo válido/i);
  assert.throws(() => parseInstintoBackup({ ...backup, lyrics: [{ ...backup.lyrics[0], sections: "invalid" }] }), /respaldo válido/i);
  assert.throws(() => parseInstintoBackup({ ...backup, projects: [{ ...backup.projects[0], status: "running" }] }), /respaldo válido/i);
});

test("INSTINTO backup enforces collection and field size limits", () => {
  const backup = sample();
  assert.throws(() => parseInstintoBackup({ ...backup, notes: Array(10_001).fill(backup.notes[0]) }), /respaldo válido/i);
  assert.throws(() => parseInstintoBackup({
    ...backup,
    draft: { ...backup.draft, content: "x".repeat(100_001) },
  }), /respaldo válido/i);
});
