import assert from "node:assert/strict";
import test from "node:test";
import { parseInstintoFallbackJournal, readLegacyInstintoData } from "./instintoDB.ts";

function createStorage(values) {
  return {
    getItem(key) { return values[key] ?? null; },
    removeItem(key) { delete values[key]; },
  };
}

test("legacy INSTINTO migration reader preserves all collections and the draft", () => {
  const values = {
    hbg_instinto_notes_v2: JSON.stringify([{ id: "n1", deleted: true }]),
    hbg_instinto_lyrics_v2: JSON.stringify([{ id: "l1", sections: [{ content: "verso" }] }]),
    hbg_instinto_projects: JSON.stringify([{ id: "p1", status: "en_progreso" }]),
    hbg_instinto_draft_v1: JSON.stringify({ title: "Borrador", content: "Texto", category: "ideas", tags: ["hbg"] }),
  };
  const data = readLegacyInstintoData(createStorage(values));
  assert.equal(data.notes[0].deleted, true);
  assert.equal(data.lyrics[0].sections[0].content, "verso");
  assert.equal(data.projects[0].status, "en_progreso");
  assert.deepEqual(data.draft, { title: "Borrador", content: "Texto", category: "ideas", tags: ["hbg"] });
});

test("legacy INSTINTO migration reader safely defaults malformed values", () => {
  const data = readLegacyInstintoData(createStorage({
    hbg_instinto_notes_v2: "{broken",
    hbg_instinto_lyrics_v2: JSON.stringify({ not: "an array" }),
    hbg_instinto_projects: "null",
    hbg_instinto_draft_v1: JSON.stringify({ title: 42, content: "ok", category: "unknown", tags: ["x", 1] }),
  }));
  assert.deepEqual(data.notes, []);
  assert.deepEqual(data.lyrics, []);
  assert.deepEqual(data.projects, []);
  assert.deepEqual(data.draft, { title: "", content: "ok", category: "notas", tags: ["x"] });
});


test("fallback journal accepts only known legacy keys and removes duplicates", () => {
  assert.deepEqual(
    parseInstintoFallbackJournal(JSON.stringify([
      "hbg_instinto_notes_v2",
      "hbg_instinto_notes_v2",
      "__unknown__",
      "hbg_instinto_lyrics_v2",
      42,
    ])),
    ["hbg_instinto_notes_v2", "hbg_instinto_lyrics_v2"],
  );
  assert.deepEqual(parseInstintoFallbackJournal("{broken"), []);
  assert.deepEqual(parseInstintoFallbackJournal(null), []);
});
