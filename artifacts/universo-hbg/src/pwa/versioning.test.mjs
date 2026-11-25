import assert from "node:assert/strict";
import test from "node:test";
import { fetchLatestBuild, isUpdateAvailable, readBuildId } from "./versioning.ts";

test("version manifest accepts a non-empty build identifier", () => {
  assert.equal(readBuildId({ buildId: "abc123" }), "abc123");
  assert.equal(readBuildId({ buildId: "  release-7  " }), "release-7");
  assert.equal(readBuildId({ buildId: "" }), null);
  assert.equal(readBuildId({ buildId: 7 }), null);
  assert.equal(readBuildId(null), null);
});

test("update state compares the installed build with the published build", () => {
  assert.equal(isUpdateAvailable("build-a", "build-b"), true);
  assert.equal(isUpdateAvailable("build-a", "build-a"), false);
  assert.equal(isUpdateAvailable("build-a", null), false);
  assert.equal(isUpdateAvailable("", "build-b"), false);
});

test("latest build fetch bypasses browser caches and validates the response", async () => {
  let requestOptions;
  const result = await fetchLatestBuild(async (_url, options) => {
    requestOptions = options;
    return new Response(JSON.stringify({ buildId: "release-9" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  assert.equal(result, "release-9");
  assert.equal(requestOptions.cache, "no-store");
  assert.equal(requestOptions.headers["Cache-Control"], "no-cache");
});

test("latest build fetch safely handles unavailable or invalid manifests", async () => {
  assert.equal(await fetchLatestBuild(async () => new Response("offline", { status: 503 })), null);
  assert.equal(await fetchLatestBuild(async () => new Response("{}", { status: 200 })), null);
});
