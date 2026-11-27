import test from "node:test";
import assert from "node:assert/strict";
import { isSupportedDeviceAudioFile } from "./deviceAudioScanner.ts";

test("device directory scanner accepts supported audio extensions case-insensitively", () => {
  for (const name of ["song.mp3", "track.WAV", "audio.flac", "voice.m4a", "sample.ogg", "clip.aac"]) {
    assert.equal(isSupportedDeviceAudioFile({ name }), true, name);
  }
});

test("device directory scanner excludes images, video, and unknown files", () => {
  for (const name of ["cover.jpg", "photo.png", "movie.mp4", "document.pdf", "no-extension"]) {
    assert.equal(isSupportedDeviceAudioFile({ name }), false, name);
  }
});
