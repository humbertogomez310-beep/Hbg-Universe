import assert from "node:assert/strict";
import test from "node:test";
import { TerminadorMemory } from "./terminadorMemory.ts";

function createStorage(initial = new Map()) {
  let failWrites = false;
  return {
    values: initial,
    get failWrites() { return failWrites; },
    set failWrites(value) { failWrites = value; },
    getItem(key) { return this.values.get(key) ?? null; },
    setItem(key, value) {
      if (failWrites) throw new Error("storage quota");
      this.values.set(key, value);
    },
    removeItem(key) { this.values.delete(key); },
  };
}

test("Terminador memory persists safe preferences and restores them", () => {
  const storage = createStorage();
  const memory = new TerminadorMemory(storage);
  memory.init();
  memory.remember("preference.music", "rock", { kind: "preference" });

  const restored = new TerminadorMemory(storage);
  restored.init();
  assert.equal(restored.recall("preference.music")?.value, "rock");
  assert.throws(
    () => restored.remember("api_token", "secret-value", { kind: "preference" }),
    /No se almacenan secretos/,
  );
});

test("Terminador memory rolls back deletions when persistence fails", () => {
  const storage = createStorage();
  const memory = new TerminadorMemory(storage);
  memory.init();
  memory.remember("decision.one", "Keep the local data", { kind: "decision" });

  storage.failWrites = true;
  assert.throws(() => memory.forget("decision.one"), /storage quota/);
  assert.equal(memory.recall("decision.one")?.value, "Keep the local data");
  assert.throws(() => memory.clear(), /storage quota/);
  assert.equal(memory.recall("decision.one")?.value, "Keep the local data");
});

test("Terminador memory enforces entry and value limits", () => {
  const storage = createStorage();
  const memory = new TerminadorMemory(storage);
  memory.init();
  for (let index = 0; index < 100; index += 1) {
    memory.remember(`preference.${index}`, "ok", { kind: "preference" });
  }
  assert.throws(
    () => memory.remember("preference.overflow", "no", { kind: "preference" }),
    /máximo de 100/,
  );
  assert.throws(
    () => memory.remember("preference.long", "x".repeat(2_001), { kind: "preference" }),
    /supera 2000 caracteres/,
  );
});
