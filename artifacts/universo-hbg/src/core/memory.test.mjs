import assert from "node:assert/strict";
import test from "node:test";
import { HBGMemoryStore } from "./memory.ts";

function withWindow(value, run) {
  const previous = globalThis.window;
  globalThis.window = value;
  try {
    run();
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
}

test("HBG memory persists valid values and reports local storage availability", () => {
  withWindow({
    localStorage: (() => {
      const values = new Map();
      return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
      };
    })(),
  }, () => {
    const first = new HBGMemoryStore();
    first.init();
    assert.equal(first.isPersistenceAvailable(), true);
    first.remember("preference.theme", "dark");

    const second = new HBGMemoryStore();
    second.init();
    assert.equal(second.isPersistenceAvailable(), true);
    assert.equal(second.recall("preference.theme"), "dark");
    assert.equal(second.forget("preference.theme"), true);

    const third = new HBGMemoryStore();
    third.init();
    assert.equal(third.recall("preference.theme"), undefined);
  });
});

test("HBG memory remains usable but reports session-only mode when storage is blocked", () => {
  withWindow({
    get localStorage() {
      throw new Error("storage blocked");
    },
  }, () => {
    const memory = new HBGMemoryStore();
    memory.init();
    assert.equal(memory.isPersistenceAvailable(), false);
    memory.remember("session.note", "still available");
    assert.equal(memory.recall("session.note"), "still available");
    assert.equal(memory.isPersistenceAvailable(), false);
    assert.throws(() => memory.remember("invalid", undefined), /No se pudo guardar memoria/);
  });
});

test("HBG memory does not crash on malformed persisted JSON and can recover on next write", () => {
  withWindow({
    localStorage: (() => {
      const values = new Map([["hbg_core_memory", "{broken"]]);
      return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
      };
    })(),
  }, () => {
    const memory = new HBGMemoryStore();
    memory.init();
    assert.equal(memory.isPersistenceAvailable(), false);
    memory.remember("recovered", true);
    assert.equal(memory.isPersistenceAvailable(), true);
  });
});
