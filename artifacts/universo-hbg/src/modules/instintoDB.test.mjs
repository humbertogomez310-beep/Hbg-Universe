import assert from "node:assert/strict";
import test from "node:test";
import {
  getInstintoMigrationKeys,
  persistInstintoFallbackData,
  persistInstintoFallbackRecord,
  readInstintoFallbackData,
  readLegacyInstintoData,
  shouldApplyInstintoFallback,
} from "./instintoDB.ts";

function createStorage(values = {}) {
  return {
    getItem(key) { return values[key] ?? null; },
    setItem(key, value) { values[key] = value; },
    removeItem(key) { delete values[key]; },
    values,
  };
}

test("legacy INSTINTO migration reader preserves all collections and the draft", () => {
  const storage = createStorage({
    hbg_instinto_notes_v2: JSON.stringify([{ id: "n1", deleted: true }]),
    hbg_instinto_lyrics_v2: JSON.stringify([{ id: "l1", sections: [{ content: "verso" }] }]),
    hbg_instinto_projects: JSON.stringify([{ id: "p1", status: "en_progreso" }]),
    hbg_instinto_draft_v1: JSON.stringify({ title: "Borrador", content: "Texto", category: "ideas", tags: ["hbg"] }),
  });
  const data = readLegacyInstintoData(storage);
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

test("an incomplete migration imports every legacy record, even without a pending marker", () => {
  assert.deepEqual(getInstintoMigrationKeys(false, null), ["notes", "lyrics", "projects", "draft"]);
});

test("a completed migration imports only records explicitly saved through the fallback", () => {
  assert.deepEqual(getInstintoMigrationKeys(true, JSON.stringify(["lyrics", "draft", "unknown", "lyrics"])), ["lyrics", "draft"]);
  assert.deepEqual(getInstintoMigrationKeys(true, "invalid-json"), []);
  assert.deepEqual(getInstintoMigrationKeys(true, null), []);
});

test("fallback writes mark each changed record for reconciliation after IndexedDB recovers", () => {
  const storage = createStorage();
  assert.equal(persistInstintoFallbackRecord("lyrics", [{ id: "l1" }], storage), true);
  assert.deepEqual(JSON.parse(storage.values.__hbg_instinto_fallback_pending_v1__), ["lyrics"]);
  const fallback = JSON.parse(storage.values.hbg_instinto_lyrics_v2);
  assert.equal(fallback.format, "hbg-instinto-record-fallback-v1");
  assert.equal(typeof fallback.revision, "number");
  assert.deepEqual(fallback.value, [{ id: "l1" }]);
  assert.deepEqual(readLegacyInstintoData(storage).lyrics, [{ id: "l1" }]);
  assert.deepEqual(getInstintoMigrationKeys(true, storage.values.__hbg_instinto_fallback_pending_v1__), ["lyrics"]);
});

test("full backup is staged as one atomic fallback record", () => {
  const storage = createStorage();
  const data = {
    notes: [{ id: "n1" }],
    lyrics: [{ id: "l1" }],
    projects: [{ id: "p1" }],
    draft: { title: "Draft", content: "Text", category: "notas", tags: [] },
  };
  assert.equal(persistInstintoFallbackData(data, storage), true);
  assert.deepEqual(readInstintoFallbackData(storage), data);
  assert.deepEqual(Object.keys(storage.values), ["__hbg_instinto_fallback_backup_v1__"]);
});

test("later edits update the staged full backup instead of creating split fallback records", () => {
  const storage = createStorage();
  const data = {
    notes: [{ id: "n1", title: "Original" }],
    lyrics: [{ id: "l1" }],
    projects: [{ id: "p1" }],
    draft: { title: "Draft", content: "Text", category: "notas", tags: [] },
  };
  assert.equal(persistInstintoFallbackData(data, storage), true);
  const updatedNotes = [{ id: "n1", title: "Updated" }];
  assert.equal(persistInstintoFallbackRecord("notes", updatedNotes, storage), true);
  assert.deepEqual(readInstintoFallbackData(storage), { ...data, notes: updatedNotes });
  assert.deepEqual(Object.keys(storage.values), ["__hbg_instinto_fallback_backup_v1__"]);
});

test("invalid staged full backup blocks partial per-record fallback writes", () => {
  const storage = createStorage();
  storage.values.__hbg_instinto_fallback_backup_v1__ = "{invalid";
  assert.equal(
    persistInstintoFallbackRecord("notes", [{ id: "n1" }], storage),
    false,
  );
  assert.deepEqual(Object.keys(storage.values), ["__hbg_instinto_fallback_backup_v1__"]);
});

test("failed atomic backup staging leaves no partial collection writes", () => {
  const values = {};
  const storage = {
    getItem(key) { return values[key] ?? null; },
    setItem() { throw new Error("quota exceeded"); },
    removeItem(key) { delete values[key]; },
  };
  const data = {
    notes: [{ id: "n1" }],
    lyrics: [{ id: "l1" }],
    projects: [{ id: "p1" }],
    draft: { title: "Draft", content: "Text", category: "notas", tags: [] },
  };
  assert.equal(persistInstintoFallbackData(data, storage), false);
  assert.deepEqual(values, {});
});


test("a stale fallback cannot replace a newer committed IndexedDB revision", () => {
  assert.equal(shouldApplyInstintoFallback(100, 101, true), false);
  assert.equal(shouldApplyInstintoFallback(100, 100, true), false);
});

test("a newer versioned fallback is reconciled over an older IndexedDB value", () => {
  assert.equal(shouldApplyInstintoFallback(102, 101, true), true);
  assert.equal(shouldApplyInstintoFallback(102, null, true), true);
});

test("an unversioned legacy fallback only imports when its IndexedDB record is absent", () => {
  assert.equal(shouldApplyInstintoFallback(null, null, false), true);
  assert.equal(shouldApplyInstintoFallback(null, null, true), false);
});

test("full fallback backups keep per-record revisions when a later edit is staged", () => {
  const storage = createStorage();
  const data = {
    notes: [{ id: "n1" }],
    lyrics: [{ id: "l1" }],
    projects: [{ id: "p1" }],
    draft: { title: "Draft", content: "Text", category: "notas", tags: [] },
  };
  assert.equal(persistInstintoFallbackData(data, storage), true);
  const first = JSON.parse(storage.values.__hbg_instinto_fallback_backup_v1__);
  const oldRevision = first.revisions.notes;
  assert.equal(typeof oldRevision, "number");
  assert.equal(persistInstintoFallbackRecord("notes", [{ id: "n1", title: "Updated" }], storage), true);
  const second = JSON.parse(storage.values.__hbg_instinto_fallback_backup_v1__);
  assert.ok(second.revisions.notes > oldRevision);
  assert.deepEqual(readInstintoFallbackData(storage).notes, [{ id: "n1", title: "Updated" }]);
});
