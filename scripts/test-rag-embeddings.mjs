import assert from "node:assert/strict";

const {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  EmbeddingProviderError,
  createHuggingFaceEmbeddingProvider,
} = await import("../src/rag/embeddings.ts");

const validVector = Array.from(
  { length: EMBEDDING_DIMENSIONS },
  (_, index) => index / EMBEDDING_DIMENSIONS,
);

let requestCount = 0;
let requestUrl = "";
const provider = createHuggingFaceEmbeddingProvider({
  token: "test-token",
  fetchImplementation: async (url, init) => {
    requestCount += 1;
    requestUrl = String(url);
    assert.equal(init?.headers?.Authorization, "Bearer test-token");
    return new Response(JSON.stringify(validVector), { status: 200 });
  },
  sleep: async () => {},
});

assert.equal(provider.model, EMBEDDING_MODEL);
assert.equal((await provider.embedText("A valid chunk")).length, EMBEDDING_DIMENSIONS);
assert.match(requestUrl, /router\.huggingface\.co\/hf-inference/);
assert.match(requestUrl, /pipeline\/feature-extraction/);
assert.equal(requestCount, 1);

const matrixProvider = createHuggingFaceEmbeddingProvider({
  token: "test-token",
  fetchImplementation: async () =>
    new Response(JSON.stringify([validVector, validVector]), { status: 200 }),
  sleep: async () => {},
});
assert.equal(
  (await matrixProvider.embedText("A matrix response")).length,
  EMBEDDING_DIMENSIONS,
);

let transientRequests = 0;
const retryingProvider = createHuggingFaceEmbeddingProvider({
  token: "test-token",
  fetchImplementation: async () => {
    transientRequests += 1;
    if (transientRequests === 1) {
      return new Response("loading", { status: 503 });
    }

    return new Response(JSON.stringify(validVector), { status: 200 });
  },
  sleep: async () => {},
});
await retryingProvider.embedText("Retry this chunk");
assert.equal(transientRequests, 2);

const wrongDimensionProvider = createHuggingFaceEmbeddingProvider({
  token: "test-token",
  fetchImplementation: async () =>
    new Response(JSON.stringify([1, 2, 3]), { status: 200 }),
  sleep: async () => {},
});
await assert.rejects(
  () => wrongDimensionProvider.embedText("Wrong dimensions"),
  (error) =>
    error instanceof EmbeddingProviderError &&
    error.code === "INVALID_RESPONSE",
);

let unauthorizedRequests = 0;
const unauthorizedProvider = createHuggingFaceEmbeddingProvider({
  token: "test-token",
  fetchImplementation: async () => {
    unauthorizedRequests += 1;
    return new Response("unauthorized", { status: 401 });
  },
  sleep: async () => {},
});
await assert.rejects(
  () => unauthorizedProvider.embedText("Bad credentials"),
  (error) =>
    error instanceof EmbeddingProviderError &&
    error.code === "AUTHENTICATION",
);
assert.equal(unauthorizedRequests, 1);

assert.throws(
  () =>
    createHuggingFaceEmbeddingProvider({
      token: "",
    }),
  (error) =>
    error instanceof EmbeddingProviderError && error.code === "CONFIGURATION",
);
await assert.rejects(
  () => provider.embedText("   "),
  (error) =>
    error instanceof EmbeddingProviderError && error.code === "INVALID_INPUT",
);

console.log("RAG embedding provider tests passed.");
