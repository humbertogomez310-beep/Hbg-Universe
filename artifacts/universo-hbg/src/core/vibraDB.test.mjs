import assert from "node:assert/strict";
import test from "node:test";
import { getAudioDuration } from "./vibraDB.ts";

function installAudioMock({ emitMetadata = true, duration = 123 } = {}) {
  const originalAudio = globalThis.Audio;
  const hadAudio = Object.hasOwn(globalThis, "Audio");
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const revoked = [];
  let instance;
  class MockAudio {
    constructor() {
      instance = this;
      this.duration = duration;
      this.listeners = new Map();
      this.muted = false;
      this.volume = 1;
      this.paused = false;
      this.currentSrc = "";
    }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    removeEventListener(name, listener) {
      if (this.listeners.get(name) === listener) this.listeners.delete(name);
    }
    set src(value) {
      this.currentSrc = value;
      if (emitMetadata) queueMicrotask(() => this.listeners.get("loadedmetadata")?.());
    }
    get src() { return this.currentSrc; }
    pause() { this.paused = true; }
    removeAttribute(name) { if (name === "src") this.currentSrc = ""; }
    load() {}
  }
  globalThis.Audio = MockAudio;
  URL.createObjectURL = () => "blob:vibra-scan-test";
  URL.revokeObjectURL = (url) => revoked.push(url);
  return {
    instance: () => instance,
    revoked,
    restore() {
      if (hadAudio) globalThis.Audio = originalAudio;
      else delete globalThis.Audio;
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    },
  };
}

test("audio metadata probe is muted and releases the media element and Blob URL", async () => {
  const mock = installAudioMock();
  try {
    assert.equal(await getAudioDuration(new Blob(["audio"])), 123);
    assert.equal(mock.instance().muted, true);
    assert.equal(mock.instance().volume, 0);
    assert.equal(mock.instance().paused, true);
    assert.equal(mock.instance().src, "");
    assert.deepEqual(mock.revoked, ["blob:vibra-scan-test"]);
  } finally {
    mock.restore();
  }
});

test("audio metadata probe rejects after its deadline and still cleans up", async () => {
  const mock = installAudioMock({ emitMetadata: false });
  try {
    await assert.rejects(
      getAudioDuration(new Blob(["audio"]), 5),
      /Tiempo de espera agotado/,
    );
    assert.equal(mock.instance().paused, true);
    assert.equal(mock.instance().src, "");
    assert.deepEqual(mock.revoked, ["blob:vibra-scan-test"]);
  } finally {
    mock.restore();
  }
});
