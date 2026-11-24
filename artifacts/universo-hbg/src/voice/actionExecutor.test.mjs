import assert from "node:assert/strict";
import test from "node:test";
import { hbgCore } from "../core/hbgCore.ts";
import { executeVoiceAction } from "./actionExecutor.ts";

test("global voice executor navigates to public modules", async () => {
  const result = await executeVoiceAction({ type: "NAVIGATE", module: "instinto" });
  assert.equal(hbgCore.getModule(), "instinto");
  assert.match(result, /INSTINTO/i);
  hbgCore.setModule("universo");
});

test("global voice executor explains capabilities and module information", async () => {
  const capabilities = await executeVoiceAction({ type: "CAPABILITIES" });
  assert.match(capabilities, /INSTINTO/);
  assert.match(capabilities, /VIBRA/);

  const info = await executeVoiceAction({ type: "APP_INFO", module: "vibra" });
  assert.match(info, /VIBRA/i);
});

test("global voice executor opens INSTINTO without claiming it created a lyric", async () => {
  const result = await executeVoiceAction({ type: "CREATE_SONG", title: "La Voz del Lobo" });
  assert.equal(hbgCore.getModule(), "instinto");
  assert.match(result, /todavía no se ha creado/i);
  hbgCore.setModule("universo");
});

test("global voice executor refuses development operations in use mode", async () => {
  hbgCore.setModule("universo");
  const result = await executeVoiceAction({ type: "BLOCKED_DEVELOPMENT" });
  assert.match(result, /sesión de desarrollo autorizada/i);
  assert.equal(hbgCore.getModule(), "universo");
});

test("voice shuffle and repeat commands dispatch to the registered VIBRA actions", async () => {
  const received = [];
  const removeShuffle = hbgCore.registerAction("music.shuffle", (payload) => {
    received.push({ action: "shuffle", payload });
    return { success: true };
  });
  const removeRepeat = hbgCore.registerAction("music.repeat", (payload) => {
    received.push({ action: "repeat", payload });
    return { success: true };
  });

  try {
    assert.match(
      await executeVoiceAction({ type: "SET_SHUFFLE", value: true }),
      /aleatorio activado/i,
    );
    assert.match(
      await executeVoiceAction({ type: "SET_REPEAT", value: true }),
      /repetición activada/i,
    );
    assert.deepEqual(received, [
      { action: "shuffle", payload: { enabled: true } },
      { action: "repeat", payload: { mode: "all" } },
    ]);
  } finally {
    removeShuffle();
    removeRepeat();
  }
});


test("voice track search activates VIBRA and plays the exact verified track ID", async () => {
  hbgCore.setModule("universo");
  const calls = [];
  let removeSearch;
  let removePlay;
  const unsubscribe = hbgCore.subscribe((module) => {
    if (module !== "vibra" || removeSearch) return;
    removeSearch = hbgCore.registerAction("music.search", (payload) => {
      calls.push({ action: "search", payload });
      return {
        success: true,
        data: { results: [{ id: "voice-track-42", title: "Coincidence" }] },
      };
    });
    removePlay = hbgCore.registerAction("music.playTrack", (payload) => {
      calls.push({ action: "play", payload });
      return {
        success: payload?.id === "voice-track-42",
        data: { track: { title: "Coincidence" } },
      };
    });
  });

  try {
    const response = await executeVoiceAction({
      type: "PLAY_TRACK",
      query: "Coincidence",
    });
    assert.equal(hbgCore.getModule(), "vibra");
    assert.match(response, /Reproduciendo Coincidence/i);
    assert.deepEqual(calls, [
      { action: "search", payload: { query: "Coincidence" } },
      { action: "play", payload: { id: "voice-track-42" } },
    ]);
  } finally {
    unsubscribe();
    removeSearch?.();
    removePlay?.();
    hbgCore.setModule("universo");
  }
});

test("voice track search asks for clarification instead of playing an ambiguous first result", async () => {
  const calls = [];
  const removeSearch = hbgCore.registerAction("music.search", () => ({
    success: true,
    data: {
      results: [
        { id: "track-live", title: "Coincidence Live" },
        { id: "track-remix", title: "Coincidence Remix" },
      ],
    },
  }));
  const removePlay = hbgCore.registerAction("music.playTrack", (payload) => {
    calls.push(payload);
    return { success: true };
  });

  try {
    const response = await executeVoiceAction({
      type: "PLAY_TRACK",
      query: "Coincidence",
    });
    assert.match(response, /varias coincidencias/i);
    assert.deepEqual(calls, []);
  } finally {
    removeSearch();
    removePlay();
  }
});


test("relative voice volume commands apply to the current VIBRA level and clamp safely", async () => {
  const previous = hbgCore.getContext("music.volume");
  const received = [];
  hbgCore.setContext("music.volume", 45);
  const unregister = hbgCore.registerAction("music.volume", (payload) => {
    received.push(payload);
    return { success: true, data: payload };
  });

  try {
    assert.match(await executeVoiceAction({ type: "ADJUST_VOLUME", delta: -5 }), /40%/);
    assert.equal(hbgCore.getContext("music.volume"), 40);
    assert.match(await executeVoiceAction({ type: "ADJUST_VOLUME", delta: 20 }), /60%/);
    assert.equal(hbgCore.getContext("music.volume"), 60);
    hbgCore.setContext("music.volume", 98);
    assert.match(await executeVoiceAction({ type: "ADJUST_VOLUME", delta: 20 }), /100%/);
    assert.deepEqual(received, [{ volume: 40 }, { volume: 60 }, { volume: 100 }]);
  } finally {
    unregister();
    hbgCore.setContext("music.volume", typeof previous === "number" ? previous : undefined);
  }
});


test("unknown voice requests receive contextual clarification instead of a generic error", async () => {
  const audio = await executeVoiceAction({ type: "UNKNOWN", raw: "bájale al sonido" });
  assert.match(audio, /subirlo, bajarlo o dejarlo en un nivel concreto/i);

  const navigation = await executeVoiceAction({ type: "UNKNOWN", raw: "abre una aplicación" });
  assert.match(navigation, /UNIVERSO, INSTINTO o VIBRA/i);
});

test("voice play always asks VIBRA to resume even when the cached context says playing", async () => {
  const previous = hbgCore.getContext("music.isPlaying");
  let calls = 0;
  hbgCore.setContext("music.isPlaying", true);
  const unregister = hbgCore.registerAction("music.play", () => {
    calls += 1;
    return { success: true };
  });
  try {
    assert.equal(await executeVoiceAction({ type: "RESUME" }), "Reproduciendo.");
    assert.equal(calls, 1);
  } finally {
    unregister();
    hbgCore.setContext("music.isPlaying", previous);
  }
});

test("voice pause always dispatches explicit pause intent even when cached context says paused", async () => {
  const previous = hbgCore.getContext("music.isPlaying");
  let calls = 0;
  hbgCore.setContext("music.isPlaying", false);
  const unregister = hbgCore.registerAction("music.pause", () => {
    calls += 1;
    return { success: true };
  });
  try {
    assert.equal(await executeVoiceAction({ type: "PAUSE" }), "Pausado.");
    assert.equal(calls, 1);
  } finally {
    unregister();
    hbgCore.setContext("music.isPlaying", previous);
  }
});
