import assert from "node:assert/strict";
import test from "node:test";
import { interpretMusicDirection, selectNextTrack, readMusicDirection } from "./musicDirector.ts";
import { parseIntent } from "../voice/intentParser.ts";

const tracks = [
  { id: "90s-a", title: "Noventa Hits", artist: "DJ Local", album: "", importedAt: 1 },
  { id: "90s-b", title: "Otra noche noventa", artist: "DJ Local", album: "", importedAt: 2 },
  { id: "romance", title: "Balada romántica", artist: "Cantante", album: "", importedAt: 3 },
];

test("interprets natural-language goals and maintains an explicit direction", () => {
  const first = interpretMusicDirection("Pon música de los noventa", { goal: "", energy: "steady" });
  assert.deepEqual(first, { goal: "de los noventa", energy: "steady" });
  assert.deepEqual(
    interpretMusicDirection("Mantén este estilo, pero con más energía", first),
    { goal: "de los noventa", energy: "up" },
  );
  assert.deepEqual(
    interpretMusicDirection("Ahora quiero música vieja", first),
    { goal: "vieja", energy: "steady" },
  );
});

test("selects only local metadata matches and avoids recent tracks when alternatives exist", () => {
  const direction = { goal: "noventa", energy: "steady" };
  assert.equal(selectNextTrack(tracks, null, [], direction)?.id, "90s-a");
  assert.equal(selectNextTrack(tracks, "90s-a", ["90s-a"], direction)?.id, "90s-b");
  assert.equal(selectNextTrack(tracks, null, [], { goal: "jazz", energy: "steady" }), null);
});

test("reads persisted direction and maps voice controls to concrete actions", () => {
  const storage = {
    getItem: () => JSON.stringify({ goal: "romántica", energy: "up" }),
  };
  assert.deepEqual(readMusicDirection(storage), { goal: "romántica", energy: "up" });
  assert.deepEqual(parseIntent("¿Qué canción está sonando?"), { type: "NOW_PLAYING" });
  assert.deepEqual(parseIntent("Activa Auto DJ"), { type: "SET_AUTO_DJ", enabled: true });
  assert.deepEqual(parseIntent("Pon música para cantar"), { type: "SET_DIRECTION", text: "Pon música para cantar" });
  assert.deepEqual(parseIntent("Crea una playlist de rock"), {
    type: "PLAYLIST_CREATE",
    name: "rock",
    query: "rock",
  });
});
