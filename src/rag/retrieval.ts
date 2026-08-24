import "server-only";

import { sql } from "drizzle-orm";

import { db, privilegedDb, type Database } from "@/db";
import { invalidInput, withDataAccess } from "@/data/internal";
import { toJsonObject } from "@/data/validation";
import { assertUuid } from "@/data/validation";

import {
  assertEmbeddingDimensions,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  getHuggingFaceEmbeddingProvider,
} from "./embeddings";
import type { EmbeddingProvider, RetrievedChunk, RetrievalQuery } from "./types";

export const DEFAULT_RETRIEVAL_TOP_K = 5;
export const MIN_RETRIEVAL_TOP_K = 1;
export const MAX_RETRIEVAL_TOP_K = 10;
export const DEFAULT_SIMILARITY_THRESHOLD = 0.55;
export const MIN_SIMILARITY_THRESHOLD = 0;
export const MAX_SIMILARITY_THRESHOLD = 1;
export const MAX_RETRIEVAL_QUERY_CHARACTERS = 2_000;

export class RetrievalError extends Error {
  readonly code = "EMBEDDING_FAILED" as const;

  constructor(message: string) {
    super(message);
    this.name = "RetrievalError";
  }
}

type RetrievalRow = Readonly<{
  chunk_id: string;
  document_id: string;
  content: string;
  metadata: unknown;
  similarity: number | string;
}>;

function normalizeTopK(value: number | undefined): number {
  const topK = value ?? DEFAULT_RETRIEVAL_TOP_K;

  if (
    !Number.isInteger(topK) ||
    topK < MIN_RETRIEVAL_TOP_K ||
    topK > MAX_RETRIEVAL_TOP_K
  ) {
    invalidInput(
      `topK must be an integer between ${MIN_RETRIEVAL_TOP_K} and ${MAX_RETRIEVAL_TOP_K}.`,
    );
  }

  return topK;
}

function normalizeSimilarityThreshold(value: number | undefined): number {
  const threshold = value ?? DEFAULT_SIMILARITY_THRESHOLD;

  if (
    !Number.isFinite(threshold) ||
    threshold < MIN_SIMILARITY_THRESHOLD ||
    threshold > MAX_SIMILARITY_THRESHOLD
  ) {
    invalidInput(
      `similarityThreshold must be between ${MIN_SIMILARITY_THRESHOLD} and ${MAX_SIMILARITY_THRESHOLD}.`,
    );
  }

  return threshold;
}

function normalizeQuery(value: string): string {
  if (typeof value !== "string") {
    invalidInput("query must be text.");
  }

  const query = value.trim();

  if (query.length === 0) {
    invalidInput("query must not be blank.");
  }

  if (query.length > MAX_RETRIEVAL_QUERY_CHARACTERS) {
    invalidInput(
      `query must not exceed ${MAX_RETRIEVAL_QUERY_CHARACTERS} characters.`,
    );
  }

  return query;
}

function normalizeBusinessId(value: string): string {
  if (typeof value !== "string") {
    invalidInput("businessId must be a UUID.");
  }

  return assertUuid(value, "businessId");
}

function serializeVector(vector: number[]): string {
  // The value is bound as a parameter and explicitly cast by PostgreSQL. It
  // is never interpolated into SQL syntax, so vector contents cannot alter the
  // query structure.
  return JSON.stringify(vector);
}

async function createQueryEmbedding(
  query: string,
  provider: EmbeddingProvider,
): Promise<number[]> {
  if (provider.model !== EMBEDDING_MODEL) {
    throw new RetrievalError(
      `Query embeddings must use ${EMBEDDING_MODEL}.`,
    );
  }

  try {
    return assertEmbeddingDimensions(await provider.embedText(query));
  } catch {
    throw new RetrievalError(
      `The query embedding must contain exactly ${EMBEDDING_DIMENSIONS} dimensions.`,
    );
  }
}

/**
 * Retrieves ready, canonical-model knowledge chunks for the current
 * authenticated request. The caller must establish withAuthenticatedDb()
 * before invoking this function; the request-scoped db handle fails closed
 * otherwise. RLS and the explicit business filter are both required.
 */
async function retrieveKnowledgeWithDatabase(
  input: RetrievalQuery,
  database: Database,
): Promise<RetrievedChunk[]> {
  const businessId = normalizeBusinessId(input.businessId);
  const query = normalizeQuery(input.query);
  const topK = normalizeTopK(input.topK);
  const similarityThreshold = normalizeSimilarityThreshold(
    input.similarityThreshold,
  );
  const provider = input.provider ?? getHuggingFaceEmbeddingProvider();
  const queryEmbedding = await createQueryEmbedding(query, provider);
  const serializedVector = serializeVector(queryEmbedding);

  const statement = sql`
    with query_embedding as (
      select cast(${serializedVector} as vector) as embedding
    ),
    scored_chunks as (
      select
        c.id as chunk_id,
        c.document_id,
        c.content,
        c.metadata,
        c.chunk_index,
        c.embedding <=> qe.embedding as distance,
        1 - (c.embedding <=> qe.embedding) as similarity
      from public.document_chunks as c
      inner join public.knowledge_documents as d
        on d.business_id = c.business_id
       and d.id = c.document_id
      cross join query_embedding as qe
      where c.business_id = cast(${businessId} as uuid)
        and d.status = 'ready'
        and c.embedding_model = ${EMBEDDING_MODEL}
        and c.embedding is not null
    )
    select chunk_id, document_id, content, metadata, similarity
    from scored_chunks
    where similarity >= ${similarityThreshold}
    order by distance asc, chunk_index asc, chunk_id asc
    limit ${topK}
  `;

  return withDataAccess("retrieve knowledge", async () => {
    const rows = (await database.execute(statement)) as unknown as RetrievalRow[];

    return rows.map((row) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      content: row.content,
      metadata: toJsonObject(row.metadata),
      similarity: Number(row.similarity),
    }));
  });
}

export async function retrieveKnowledge(
  input: RetrievalQuery,
): Promise<RetrievedChunk[]> {
  return retrieveKnowledgeWithDatabase(input, db);
}

/**
 * Trusted server boundary for the anonymous chat route. Callers must supply a
 * business ID obtained from a separately validated session/visitor lookup.
 * This is not exposed to clients and must not replace the request-scoped RLS
 * path for authenticated application data access.
 */
export async function retrieveKnowledgeForTrustedServer(
  input: RetrievalQuery,
): Promise<RetrievedChunk[]> {
  return retrieveKnowledgeWithDatabase(input, privilegedDb);
}
