import assert from "node:assert/strict";
import test from "node:test";
import {
  HBG_RELEASE_VERSION,
  fetchLatestBuild,
  fetchLatestVersion,
  isUpdateAvailable,
  readBuildId,
  readVersionManifest,
} from "./versioning.ts";

test("the first public Universo HBG release is identified as 0.1", () => {
  assert.equal(HBG_RELEASE_VERSION, "0.1");
});

test("version manifest validates the release and technical build identifiers", () => {
  assert.deepEqual(
    readVersionManifest({ releaseVersion: "0.1", buildId: "abc123" }),
    { releaseVersion: "0.1", buildId: "abc123" },
  );
  assert.deepEqual(
    readVersionManifest({ releaseVersion: "0.1.2", buildId: "abc123" }),
    { releaseVersion: "0.1.2", buildId: "abc123" },
  );
  assert.equal(readVersionManifest({ releaseVersion: "1", buildId: "abc123" }), null);
  assert.equal(readVersionManifest({ releaseVersion: "0.1", buildId: "" }), null);
  assert.equal(readVersionManifest(null), null);
});

test("legacy build identifier reader remains safe", () => {
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

test("latest version fetch bypasses browser caches and validates the response", async () => {
  let requestOptions;
  const result = await fetchLatestVersion(async (_url, options) => {
    requestOptions = options;
    return new Response(JSON.stringify({ releaseVersion: "0.1", buildId: "release-9" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  assert.deepEqual(result, { releaseVersion: "0.1", buildId: "release-9" });
  assert.equal(requestOptions.cache, "no-store");
  assert.equal(requestOptions.headers["Cache-Control"], "no-cache");
});

test("latest build helper returns the technical build identifier", async () => {
  assert.equal(
    await fetchLatestBuild(async () => new Response(
      JSON.stringify({ releaseVersion: "0.1", buildId: "release-9" }),
      { status: 200 },
    )),
    "release-9",
  );
});

test("latest version fetch safely handles unavailable or invalid manifests", async () => {
  assert.equal(await fetchLatestVersion(async () => new Response("offline", { status: 503 })), null);
  assert.equal(await fetchLatestVersion(async () => new Response("{}", { status: 200 })), null);
});
