import assert from "node:assert/strict";
import test from "node:test";
import { remoteApiEnabled } from "./apiConfig.ts";

test("remote API stays enabled for existing server-backed releases by default", () => {
  assert.equal(remoteApiEnabled(undefined), true);
});

test("static Local-first release can disable remote API calls explicitly", () => {
  assert.equal(remoteApiEnabled("false"), false);
});

test("remote API remains enabled when explicitly configured", () => {
  assert.equal(remoteApiEnabled("true"), true);
});
