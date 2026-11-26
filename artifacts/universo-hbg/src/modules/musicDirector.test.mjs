import assert from "node:assert/strict";
import test from "node:test";
import { interpretMusicDirection, selectNextTrack, selectTracksForDirection, selectAutoDjCandidates, selectNextAutoDjTrack, readMusicDirection } from "./musicDirector.ts";
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
    interpretMusicDirection("Mantén este estilo, pero con más energía", first),
    { goal: "de los noventa", energy: "up" },
  );
  assert.deepEqual(
    interpretMusicDirection("Ahora quiero música vieja", first),
    { goal: "vieja", energy: "steady" },
  );
});

test("more bailable and singing requests modify the existing goal instead of replacing it", () => {
  const current = { goal: "noventa", energy: "steady" };
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
  const direction = { goal: "noventa", energy: "steady" };
  assert.equal(selectNextTrack(tracks, null, [], direction)?.id, "90s-a");
  assert.equal(selectNextTrack(tracks, "90s-a", ["90s-a"], direction)?.id, "90s-b");
  assert.equal(selectNextTrack(tracks, null, [], { goal: "jazz", energy: "steady" }), null);
});

test("Auto DJ continues through the local library when no explicit direction is fixed", () => {
  const plain = [
    { id: "one", title: "Track One", artist: "Unknown", album: "", importedAt: 1 },
    { id: "two", title: "Track Two", artist: "Unknown", album: "", importedAt: 2 },
    { id: "three", title: "Track Three", artist: "Unknown", album: "", importedAt: 3 },
  ];
  assert.deepEqual(selectAutoDjCandidates(plain, { goal: "", energy: "steady" }), plain);
  assert.equal(selectNextAutoDjTrack(plain, "one", ["two"], { goal: "", energy: "steady" })?.id, "three");
});

test("Modo Fiesta continues with available tracks when metadata has no energy labels", () => {
  const unlabeled = [{ id: "plain", title: "Track One", artist: "Unknown", album: "", importedAt: 1 }];
  assert.equal(selectNextAutoDjTrack(unlabeled, null, [], { goal: "", energy: "up" })?.id, "plain");
});

test("Auto DJ never drops an explicit genre or vocal-first constraint to fill the queue", () => {
  assert.deepEqual(
    selectAutoDjCandidates(tracks, { goal: "noventa", energy: "steady" }).map((track) => track.id),
    ["90s-a", "90s-b"],
  );
  assert.equal(selectNextAutoDjTrack(tracks, null, [], { goal: "jazz", energy: "steady" }), null);
  assert.equal(
    selectNextAutoDjTrack(
      [{ id: "plain", title: "Track One", artist: "Unknown", album: "", importedAt: 1 }],
      null,
      [],
      { goal: "", energy: "steady", vocalFocus: true },
    ),
    null,
  );
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
    ["party", "romance"],
  );
});

test("does not create an unfiltered playlist when a query contains no usable intent", () => {
  assert.deepEqual(selectTracksForDirection(tracks, { goal: "algo", energy: "steady" }), []);
  const unlabeled = [{ id: "plain", title: "Track One", artist: "Unknown", album: "", importedAt: 1 }];
  assert.deepEqual(selectTracksForDirection(unlabeled, { goal: "", energy: "up" }), []);
});


test("Auto DJ ranks the next track by confident tempo and harmonic compatibility", () => {
  const analyzed = [
    { id: "current", title: "Current", artist: "A", album: "", importedAt: 1, bpm: 120, bpmConfidence: 0.9, musicalKey: "C major", keyConfidence: 0.9 },
    { id: "poor-match", title: "Poor Match", artist: "B", album: "", importedAt: 2, bpm: 94, bpmConfidence: 0.9, musicalKey: "D major", keyConfidence: 0.9 },
    { id: "good-match", title: "Good Match", artist: "C", album: "", importedAt: 3, bpm: 122, bpmConfidence: 0.8, musicalKey: "G major", keyConfidence: 0.8 },
  ];
  assert.equal(selectNextAutoDjTrack(analyzed, "current", [], { goal: "", energy: "steady" })?.id, "good-match");
});

test("Auto DJ does not trust low-confidence BPM/key estimates", () => {
  const analyzed = [
    { id: "current", title: "Current", artist: "A", album: "", importedAt: 1, bpm: 120, bpmConfidence: 0.9, musicalKey: "C major", keyConfidence: 0.9 },
    { id: "first", title: "First", artist: "B", album: "", importedAt: 2, bpm: 94, bpmConfidence: 0.1, musicalKey: "D major", keyConfidence: 0.1 },
    { id: "second", title: "Second", artist: "C", album: "", importedAt: 3, bpm: 122, bpmConfidence: 0.1, musicalKey: "G major", keyConfidence: 0.1 },
  ];
  assert.equal(selectNextAutoDjTrack(analyzed, "current", [], { goal: "", energy: "steady" })?.id, "first");
});
