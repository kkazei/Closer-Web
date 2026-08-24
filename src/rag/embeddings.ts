import "server-only";

import type { EmbeddingProvider } from "./types";

export const EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2" as const;
export const EMBEDDING_DIMENSIONS = 384 as const;
export const HUGGING_FACE_FEATURE_EXTRACTION_ENDPOINT =
  "https://router.huggingface.co/hf-inference/models" as const;

type EmbeddingErrorCode =
  | "CONFIGURATION"
  | "INVALID_INPUT"
  | "AUTHENTICATION"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "REQUEST_FAILED";

export class EmbeddingProviderError extends Error {
  readonly code: EmbeddingErrorCode;
  readonly retryable: boolean;

  constructor(
    code: EmbeddingErrorCode,
    message: string,
    retryable = false,
  ) {
    super(message);
    this.name = "EmbeddingProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}

type HuggingFaceEmbeddingProviderOptions = Readonly<{
  token?: string;
  model?: string;
  endpointBase?: string;
  fetchImplementation?: typeof fetch;
  maxRetries?: number;
  timeoutMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}>;

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_SLEEP = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function modelPath(model: string): string {
  return model.split("/").map(encodeURIComponent).join("/");
}

function endpointFor(model: string, endpointBase: string): string {
  return `${endpointBase.replace(/\/$/u, "")}/${modelPath(
    model,
  )}/pipeline/feature-extraction`;
}

function isNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) => typeof item === "number" && Number.isFinite(item),
    )
  );
}

function meanRows(rows: number[][]): number[] {
  const width = rows[0]?.length ?? 0;

  if (width === 0 || rows.some((row) => row.length !== width)) {
    throw new EmbeddingProviderError(
      "INVALID_RESPONSE",
      "The embedding provider returned an invalid vector shape.",
    );
  }

  return Array.from({ length: width }, (_, column) =>
    rows.reduce((sum, row) => sum + row[column]!, 0) / rows.length,
  );
}

/**
 * Hugging Face feature extraction responses have appeared as a flat vector,
 * one-row vector, or token-by-dimension matrices depending on the provider
 * path. A token matrix is mean-pooled; no padding or truncation is allowed.
 */
export function extractEmbeddingVector(value: unknown): number[] {
  if (isNumberArray(value)) {
    return value;
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new EmbeddingProviderError(
      "INVALID_RESPONSE",
      "The embedding provider returned no vector.",
    );
  }

  if (value.every((row) => isNumberArray(row))) {
    return meanRows(value as number[][]);
  }

  const first = value[0];

  if (Array.isArray(first)) {
    return extractEmbeddingVector(first);
  }

  throw new EmbeddingProviderError(
    "INVALID_RESPONSE",
    "The embedding provider returned an invalid vector shape.",
  );
}

export function assertEmbeddingDimensions(value: number[]): number[] {
  if (
    value.length !== EMBEDDING_DIMENSIONS ||
    value.some((component) => !Number.isFinite(component))
  ) {
    throw new EmbeddingProviderError(
      "INVALID_RESPONSE",
      `The embedding provider must return exactly ${EMBEDDING_DIMENSIONS} finite dimensions.`,
    );
  }

  return value;
}

function retryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function providerErrorForStatus(status: number): EmbeddingProviderError {
  if (status === 401 || status === 403) {
    return new EmbeddingProviderError(
      "AUTHENTICATION",
      "Hugging Face rejected the embedding request credentials.",
    );
  }

  if (status === 429) {
    return new EmbeddingProviderError(
      "RATE_LIMITED",
      "Hugging Face rate-limited the embedding request.",
      true,
    );
  }

  if (retryableStatus(status)) {
    return new EmbeddingProviderError(
      "UNAVAILABLE",
      "Hugging Face is temporarily unavailable for embeddings.",
      true,
    );
  }

  return new EmbeddingProviderError(
    "REQUEST_FAILED",
    "Hugging Face rejected the embedding request.",
  );
}

function normalizeRequestError(error: unknown): EmbeddingProviderError {
  if (error instanceof EmbeddingProviderError) {
    return error;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return new EmbeddingProviderError(
      "UNAVAILABLE",
      "The Hugging Face embedding request timed out.",
      true,
    );
  }

  return new EmbeddingProviderError(
    "UNAVAILABLE",
    "The Hugging Face embedding request could not be completed.",
    true,
  );
}

export function createHuggingFaceEmbeddingProvider(
  options: HuggingFaceEmbeddingProviderOptions = {},
): EmbeddingProvider {
  const token = options.token ?? process.env.HF_TOKEN;
  const model = options.model ?? EMBEDDING_MODEL;
  const endpointBase =
    options.endpointBase ?? HUGGING_FACE_FEATURE_EXTRACTION_ENDPOINT;
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sleep = options.sleep ?? DEFAULT_SLEEP;

  if (!token?.trim()) {
    throw new EmbeddingProviderError(
      "CONFIGURATION",
      "HF_TOKEN is not configured.",
    );
  }

  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 3) {
    throw new EmbeddingProviderError(
      "CONFIGURATION",
      "Embedding retry configuration is invalid.",
    );
  }

  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new EmbeddingProviderError(
      "CONFIGURATION",
      "Embedding timeout configuration is invalid.",
    );
  }

  const endpoint = endpointFor(model, endpointBase);

  return {
    model,
    async embedText(text: string): Promise<number[]> {
      const input = text.trim();

      if (input.length === 0) {
        throw new EmbeddingProviderError(
          "INVALID_INPUT",
          "Cannot embed an empty chunk.",
        );
      }

      let lastError: EmbeddingProviderError | undefined;

      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await fetchImplementation(endpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ inputs: input }),
            signal: controller.signal,
          });

          if (!response.ok) {
            throw providerErrorForStatus(response.status);
          }

          let payload: unknown;

          try {
            payload = await response.json();
          } catch {
            throw new EmbeddingProviderError(
              "INVALID_RESPONSE",
              "The embedding provider returned invalid JSON.",
            );
          }

          return assertEmbeddingDimensions(extractEmbeddingVector(payload));
        } catch (error) {
          const normalizedError = normalizeRequestError(error);
          lastError = normalizedError;

          if (!normalizedError.retryable || attempt >= maxRetries) {
            throw normalizedError;
          }
        } finally {
          clearTimeout(timeout);
        }

        await sleep(Math.min(2_000, 250 * 2 ** attempt));
      }

      throw (
        lastError ??
        new EmbeddingProviderError(
          "UNAVAILABLE",
          "The embedding provider did not return a result.",
        )
      );
    },
  };
}

export function getHuggingFaceEmbeddingProvider(): EmbeddingProvider {
  return createHuggingFaceEmbeddingProvider();
}
