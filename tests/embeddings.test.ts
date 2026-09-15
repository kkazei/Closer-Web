import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  EmbeddingProviderError,
  assertEmbeddingDimensions,
  createHuggingFaceEmbeddingProvider,
  extractEmbeddingVector,
} from "@/rag/embeddings";

const vector = () => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => index / 1000);

describe("embedding provider boundary", () => {
  it("accepts flat vectors and mean-pools token rows", () => {
    expect(extractEmbeddingVector([1, 2, 3])).toEqual([1, 2, 3]);
    expect(extractEmbeddingVector([[1, 3], [3, 5]])).toEqual([2, 4]);
  });

  it("requires exactly 384 finite dimensions", () => {
    expect(assertEmbeddingDimensions(vector())).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(() => assertEmbeddingDimensions([1, 2])).toThrow(EmbeddingProviderError);
    expect(() => assertEmbeddingDimensions([...vector().slice(0, -1), Number.NaN])).toThrow(
      EmbeddingProviderError,
    );
  });

  it("sends the canonical model request and retries transient failures", async () => {
    let attempts = 0;
    let firstUrl = "";
    const sleep = jest.fn(async () => undefined);
    const fetchImplementation = jest.fn(async (...args: Parameters<typeof fetch>) => {
      attempts += 1;

      if (attempts === 1) {
        firstUrl = String(args[0]);
      }

      if (attempts < 3) {
        return { ok: false, status: 503 } as Response;
      }

      return {
        ok: true,
        json: async () => vector(),
      } as Response;
    });

    const provider = createHuggingFaceEmbeddingProvider({
      token: "hf-test-token",
      fetchImplementation,
      sleep,
      maxRetries: 2,
    });
    const result = await provider.embedText("  SaaS qualification  ");

    expect(provider.model).toBe(EMBEDDING_MODEL);
    expect(result).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(firstUrl).toContain(
      "sentence-transformers/all-MiniLM-L6-v2",
    );
  });

  it("rejects missing credentials before making a request", () => {
    expect(() => createHuggingFaceEmbeddingProvider({ token: " " })).toThrow(
      "HF_TOKEN is not configured",
    );
  });
});
