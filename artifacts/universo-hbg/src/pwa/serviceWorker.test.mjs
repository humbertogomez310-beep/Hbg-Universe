import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const workerSource = await readFile(new URL("../../public/sw.js", import.meta.url), "utf8");

function createWorkerHarness(fetchImpl) {
  const listeners = new Map();
  const stored = new Map();
  const deleted = [];
  let skippedWaiting = false;
  let claimed = false;

  const cache = {
    async put(request, response) {
      const key = typeof request === "string" ? request : request.url;
      stored.set(key, response.clone());
    },
    async addAll(requests) {
      for (const request of requests) {
        const response = await fetchImpl(request);
        if (!response.ok) throw new Error("Precaching failed");
        await this.put(request, response);
      }
    },
    async match(request) {
      const key = typeof request === "string" ? request : request.url;
      return stored.get(key)?.clone();
    },
  };

  const self = {
    location: { origin: "https://hbg.test" },
    addEventListener(name, handler) { listeners.set(name, handler); },
    async skipWaiting() { skippedWaiting = true; },
    clients: { async claim() { claimed = true; } },
  };

  runInNewContext(workerSource, {
    self,
    caches: {
      async open() { return cache; },
      async keys() { return ["hbg-shell-old", "unrelated-cache"]; },
      async delete(key) { deleted.push(key); return true; },
    },
    fetch: fetchImpl,
    URL,
    Response,
  });

  return {
    listeners,
    stored,
    deleted,
    get skippedWaiting() { return skippedWaiting; },
    get claimed() { return claimed; },
  };
}

test("PWA installation caches the shell, manifest, and built JavaScript/CSS assets", async () => {
  const requested = [];
  const harness = createWorkerHarness(async (request) => {
    requested.push(String(request));
    const url = String(request);
    if (url === "/") {
      return new Response(
        '<script type="module" src="/assets/app-123.js"></script><link rel="stylesheet" href="/assets/app-123.css">',
        { status: 200 },
      );
    }
    return new Response("asset", { status: 200 });
  });

  let installPromise;
  harness.listeners.get("install")({ waitUntil(promise) { installPromise = promise; } });
  await installPromise;

  assert.equal(harness.skippedWaiting, true);
  assert.ok(harness.stored.has("/"));
  assert.ok(harness.stored.has("https://hbg.test/manifest.webmanifest"));
  assert.ok(harness.stored.has("https://hbg.test/assets/app-123.js"));
  assert.ok(harness.stored.has("https://hbg.test/assets/app-123.css"));
  assert.ok(requested.includes("/"));
});

test("PWA activation removes only old HBG shell caches", async () => {
  const harness = createWorkerHarness(async () => new Response("ok"));
  let activatePromise;
  harness.listeners.get("activate")({ waitUntil(promise) { activatePromise = promise; } });
  await activatePromise;

  assert.deepEqual(harness.deleted, ["hbg-shell-old"]);
  assert.equal(harness.claimed, true);
});

test("PWA serves the cached app shell for offline navigation but never intercepts API requests", async () => {
  const harness = createWorkerHarness(async (request) => {
    if (String(request) === "/") {
      return new Response("<main>HBG shell</main>", { status: 200 });
    }
    return new Response("asset", { status: 200 });
  });

  let installPromise;
  harness.listeners.get("install")({ waitUntil(promise) { installPromise = promise; } });
  await installPromise;

  let navigationResponse;
  const navigationRequest = {
    method: "GET",
    url: "https://hbg.test/instinto",
    mode: "navigate",
    destination: "document",
  };
  harness.listeners.get("fetch")({
    request: navigationRequest,
    respondWith(promise) { navigationResponse = promise; },
  });

  const response = await navigationResponse;
  assert.equal(response.status, 200);
  assert.match(await response.text(), /HBG shell/);

  let apiIntercepted = false;
  harness.listeners.get("fetch")({
    request: {
      method: "GET",
      url: "https://hbg.test/api/core/chat",
      mode: "cors",
      destination: "",
    },
    respondWith() { apiIntercepted = true; },
  });
  assert.equal(apiIntercepted, false);
});
