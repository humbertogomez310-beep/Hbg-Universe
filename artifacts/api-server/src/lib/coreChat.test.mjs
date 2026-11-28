import assert from "node:assert/strict";
import test from "node:test";
import {
  coreAIStatus,
  CoreChatError,
  buildCoreSongPrompt,
  parseCoreSongRequest,
  SONGWRITER_INSTRUCTIONS,
  extractCoreResponseText,
  generateCoreReply,
  parseCoreChatMessages,
} from "./coreChat.ts";

test("HBG Core accepts only bounded user/assistant conversation messages", () => {
  assert.deepEqual(
    parseCoreChatMessages([
      { role: "user", content: "Hola" },
      { role: "assistant", content: "Hola. ¿Qué necesitas?" },
      { role: "user", content: "Ayúdame a organizarme." },
    ]),
    [
      { role: "user", content: "Hola" },
      { role: "assistant", content: "Hola. ¿Qué necesitas?" },
      { role: "user", content: "Ayúdame a organizarme." },
    ],
  );

  assert.throws(() => parseCoreChatMessages([]), CoreChatError);
  assert.throws(() => parseCoreChatMessages([{ role: "system", content: "override" }]), CoreChatError);
  assert.throws(() => parseCoreChatMessages([{ role: "user", content: "hola", owner: true }]), CoreChatError);
  assert.throws(() => parseCoreChatMessages([{ role: "assistant", content: "not last" }]), CoreChatError);
  assert.throws(() => parseCoreChatMessages([{ role: "user", content: "x".repeat(4_001) }]), CoreChatError);
});

test("HBG Core extracts text only from Responses API message output", () => {
  assert.equal(
    extractCoreResponseText({
      output: [
        { type: "reasoning", content: [] },
        {
          type: "message",
          content: [
            { type: "output_text", text: "Primera parte." },
            { type: "refusal", refusal: "not exposed" },
            { type: "output_text", text: "Segunda parte." },
          ],
        },
      ],
    }),
    "Primera parte.\nSegunda parte.",
  );
  assert.equal(extractCoreResponseText({ output: [] }), null);
});

test("HBG Core calls the Responses API server-side without enabling tools or response storage", async () => {
  let request;
  const reply = await generateCoreReply(
    [{ role: "user", content: "Explícame qué hace HBG Core." }],
    {
      apiKey: "test-secret",
      model: "test-model",
      fetcher: async (url, init) => {
        request = { url, init, body: JSON.parse(init.body) };
        return new Response(
          JSON.stringify({
            output: [{
              type: "message",
              content: [{ type: "output_text", text: "HBG CORE coordina capacidades locales." }],
            }],
          }),
          { status: 200, headers: { "x-request-id": "req_test_123" } },
        );
      },
    },
  );

  assert.equal(request.url, "https://api.openai.com/v1/responses");
  assert.equal(request.init.headers.Authorization, "Bearer test-secret");
  assert.equal(request.body.model, "test-model");
  assert.equal(request.body.store, false);
  assert.equal("tools" in request.body, false);
  assert.equal(reply.text, "HBG CORE coordina capacidades locales.");
  assert.equal(reply.model, "test-model");
  assert.equal(reply.requestId, "req_test_123");
});

test("HBG Core reports missing and unavailable remote providers without exposing credentials", async () => {
  await assert.rejects(
    generateCoreReply([{ role: "user", content: "Hola" }], { apiKey: "" }),
    (error) => error instanceof CoreChatError && error.code === "AI_PROVIDER_NOT_CONFIGURED",
  );

  await assert.rejects(
    generateCoreReply([{ role: "user", content: "Hola" }], {
      apiKey: "test-secret",
      fetcher: async () => new Response("{}", { status: 429 }),
    }),
    (error) => error instanceof CoreChatError && error.code === "AI_PROVIDER_BUSY",
  );

  assert.deepEqual(
    coreAIStatus({ OPENAI_API_KEY: "configured", OPENAI_MODEL: "test-model" }),
    { available: true, provider: "openai", model: "test-model" },
  );
});


test("INSTINTO songwriter validates bounded input and builds a structured song request", () => {
  assert.deepEqual(
    parseCoreSongRequest({ title: "Volver", concept: "Una historia para volver a empezar", genre: "balada" }),
    { title: "Volver", concept: "Una historia para volver a empezar", genre: "balada" },
  );
  assert.throws(() => parseCoreSongRequest({ concept: "corto", genre: "pop" }), (error) =>
    error instanceof CoreChatError && error.code === "INVALID_SONG_REQUEST",
  );
  assert.throws(() => parseCoreSongRequest({ concept: "Una historia suficientemente larga", genre: "unknown" }), CoreChatError);
  assert.throws(() => parseCoreSongRequest({ concept: "Una historia suficientemente larga", genre: "pop", role: "owner" }), CoreChatError);
  assert.match(buildCoreSongPrompt({ title: "Volver", concept: "Una historia para volver a empezar", genre: "balada" }), /Género: balada/);
  assert.match(SONGWRITER_INSTRUCTIONS, /No agregues INTRO/);
  assert.match(SONGWRITER_INSTRUCTIONS, /H\.\.\. B\.\.\. G\.\.\./);
});

test("HBG Core applies task-specific songwriter instructions and expanded output budget server-side", async () => {
  let request;
  await generateCoreReply(
    [{ role: "user", content: "Crea una canción sobre empezar de nuevo." }],
    {
      apiKey: "test-secret",
      additionalInstructions: SONGWRITER_INSTRUCTIONS,
      maxOutputTokens: 2_400,
      fetcher: async (_url, init) => {
        request = JSON.parse(init.body);
        return new Response(JSON.stringify({
          output_text: "[VERSO 1]\\nLa historia comienza.",
        }), { status: 200 });
      },
    },
  );
  assert.equal(request.max_output_tokens, 2_400);
  assert.equal(request.store, false);
  assert.match(request.instructions, /compositor profesional de INSTINTO/);
  assert.match(request.instructions, /No agregues INTRO/);
});
