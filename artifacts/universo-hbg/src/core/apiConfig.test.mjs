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

test("remote API URL defaults to same-origin and normalizes absolute API origins", async () => {
  const { hbgApiUrl } = await import("./apiConfig.ts");
  assert.equal(hbgApiUrl("/api/core/songwriter", undefined), "/api/core/songwriter");
  assert.equal(
    hbgApiUrl("api/core/songwriter", "https://hbg-core-api.example.onrender.com/"),
    "https://hbg-core-api.example.onrender.com/api/core/songwriter",
  );
});

test("remote API URL rejects credentials and non-HTTP protocols", async () => {
  const { hbgApiUrl } = await import("./apiConfig.ts");
  assert.throws(() => hbgApiUrl("/api/core/songwriter", "javascript:alert(1)"), /HTTP\(S\)/);
  assert.throws(() => hbgApiUrl("/api/core/songwriter", "https://user:pass@example.com"), /credenciales/);
});
