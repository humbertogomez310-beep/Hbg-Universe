import assert from "node:assert/strict";
import test from "node:test";
import { createTerminadorPlan } from "./terminadorPlanner.ts";
import { executeTerminadorPlanWithHBG } from "./terminadorExecution.ts";

test("Terminador plays the exact track ID returned by its verified VIBRA library search", async () => {
  const dispatched = [];
  const core = {
    getRegisteredActions: () => ["music.search", "music.playTrack"],
    setModule: () => undefined,
    getContext: () => undefined,
    dispatchAction: async (name, payload) => {
      dispatched.push({ name, payload });
      if (name === "music.search") {
        return {
          success: true,
          data: { results: [{ id: "track-verified-42", title: "Coincidence" }] },
        };
      }
      if (name === "music.playTrack") {
        return {
          success: payload?.id === "track-verified-42",
          data: { trackId: payload?.id },
          error: "Wrong track selected",
        };
      }
      return { success: false, error: "Unexpected action" };
    },
  };
  const plan = createTerminadorPlan({
    providerId: "test",
    originalText: "reproduce Coincidence",
    normalizedText: "reproduce coincidence",
    operations: [{
      type: "music",
      action: { type: "PLAY_TRACK", query: "Coincidence" },
    }],
    module: "vibra",
    entities: [],
    confidence: 1,
    requiresClarification: false,
    explanation: "Local library search",
  });

  const result = await executeTerminadorPlanWithHBG(plan, {
    request: async () => ({ ok: false, status: 500 }),
    core,
  });

  assert.equal(result.state, "completed");
  assert.deepEqual(dispatched, [
    { name: "music.search", payload: { query: "Coincidence" } },
    { name: "music.playTrack", payload: { id: "track-verified-42" } },
  ]);
  assert.equal(result.tasks.every((task) => task.state === "completed"), true);
});

test("Terminador blocks playback when the search result has no valid track ID", async () => {
  const core = {
    getRegisteredActions: () => ["music.search", "music.playTrack"],
    setModule: () => undefined,
    getContext: () => undefined,
    dispatchAction: async (name) => name === "music.search"
      ? { success: true, data: { results: [{ title: "Missing ID" }] } }
      : { success: true },
  };
  const plan = createTerminadorPlan({
    providerId: "test",
    originalText: "reproduce canción",
    normalizedText: "reproduce cancion",
    operations: [{
      type: "music",
      action: { type: "PLAY_TRACK", query: "canción" },
    }],
    module: "vibra",
    entities: [],
    confidence: 1,
    requiresClarification: false,
    explanation: "Missing result identifier",
  });

  const result = await executeTerminadorPlanWithHBG(plan, {
    request: async () => ({ ok: false, status: 500 }),
    core,
  });

  assert.equal(result.tasks[0].state, "completed");
  assert.equal(result.tasks[1].state, "blocked");
  assert.match(result.tasks[1].reason, /ID de pista válido/i);
});
