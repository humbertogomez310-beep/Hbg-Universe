import assert from "node:assert/strict";
import test from "node:test";
import { interpretMusicDirection, selectNextTrack, selectTracksForDirection, readMusicDirection } from "./musicDirector.ts";
import { parseIntent } from "../voice/intentParser.ts";

const tracks = [
  { id: "90s-a", title: "Noventa Hits", artist: "DJ Local", album: "", importedAt: 1 },
  { id: "90s-b", title: "Otra noche noventa", artist: "DJ Local", album: "", importedAt: 2 },
  { id: "romance", title: "Balada romántica", artist: "Cantante", album: "", importedAt: 3 },
  { id: "party", title: "Club Remix", artist: "Live Vocal", album: "", importedAt: 4 },
  { id: "ambient", title: "Ambient Piano", artist: "Instrumental", album: "", importedAt: 5 },
];

test("interprets natural-language goals and maintains an explicit direction", () => {
  const first = interpretMusicDirection("Pon música de los noventa", { goal: "", energy: "steady" });
  assert.deepEqual(first, { goal: "de los noventa", energy: "steady" });
  assert.deepEqual(
    interpretMusicDirection("Mantén este estilo, pero con más energía", first!),
    { goal: "de los noventa", energy: "up" },
  );
  assert.deepEqual(
    interpretMusicDirection("Ahora quiero música vieja", first!),
    { goal: "vieja", energy: "steady" },
  );
});

test("more bailable and singing requests modify the existing goal instead of replacing it", () => {
  const current = { goal: "noventa", energy: "steady" as const };
  assert.deepEqual(interpretMusicDirection("Más bailable", current), { goal: "noventa", energy: "up" });
  assert.deepEqual(interpretMusicDirection("Más para cantar", current), { goal: "noventa", energy: "steady", vocalFocus: true });
  assert.deepEqual(interpretMusicDirection("Pon música para cantar", { goal: "", energy: "steady" }), {
    goal: "", energy: "steady", vocalFocus: true,
  });
});

test("viejita and era requests match common year labels in local track metadata", () => {
  const oldies = selectNextTrack(tracks, null, [], { goal: "viejita", energy: "steady" });
  assert.equal(oldies?.id, "90s-a");
  const nineties = selectNextTrack(tracks, null, [], { goal: "de los noventa", energy: "steady" });
  assert.equal(nineties?.id, "90s-a");
});

test("Auto DJ ranks energy and vocal hints using only local metadata", () => {
  assert.equal(selectNextTrack(tracks, null, [], { goal: "", energy: "up" })?.id, "party");
  assert.equal(selectNextTrack(tracks, null, [], { goal: "", energy: "steady", vocalFocus: true })?.id, "party");
});

test("selects only local metadata matches and avoids recent tracks when alternatives exist", () => {
  const direction = { goal: "noventa", energy: "steady" as const };
  assert.equal(selectNextTrack(tracks, null, [], direction)?.id, "90s-a");
  assert.equal(selectNextTrack(tracks, "90s-a", ["90s-a"], direction)?.id, "90s-b");
  assert.equal(selectNextTrack(tracks, null, [], { goal: "jazz", energy: "steady" }), null);
});

test("reads persisted direction and maps voice controls to concrete actions", () => {
  const storage = {
    getItem: () => JSON.stringify({ goal: "romántica", energy: "up", vocalFocus: true }),
  };
  assert.deepEqual(readMusicDirection(storage), { goal: "romántica", energy: "up", vocalFocus: true });
  assert.deepEqual(parseIntent("¿Qué canción está sonando?"), { type: "NOW_PLAYING" });
  assert.deepEqual(parseIntent("Activa Auto DJ"), { type: "SET_AUTO_DJ", enabled: true });
  assert.deepEqual(parseIntent("Pon música para cantar"), { type: "SET_DIRECTION", text: "Pon música para cantar" });
  assert.deepEqual(parseIntent("Crea una playlist de rock"), {
    type: "PLAYLIST_CREATE",
    name: "rock",
    query: "rock",
  });
});

test("playlist selection builds a bounded ordered list from the same explicit direction", () => {
  assert.deepEqual(selectTracksForDirection(tracks, { goal: "noventa", energy: "steady" }, 10).map((track) => track.id), ["90s-a", "90s-b"]);
});

test("vocal-first selection excludes tracks whose metadata gives no vocal clue", () => {
  assert.deepEqual(
    selectTracksForDirection(tracks, { goal: "", energy: "steady", vocalFocus: true }).map((track) => track.id),
    ["romance", "party"],
  );
});
