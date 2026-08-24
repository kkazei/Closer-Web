export type EmbeddingProvider = Readonly<{
  model: string;
  embedText(text: string): Promise<number[]>;
}>;

export type KnowledgeIngestionInput = Readonly<{
  authenticatedUserId: string;
  businessId: string;
  documentId: string;
  content: string;
  provider?: EmbeddingProvider;
}>;

export type KnowledgeIngestionResult = Readonly<{
  businessId: string;
  documentId: string;
  status: "ready";
  chunkCount: number;
  embeddingModel: string;
  durationMs: number;
}>;

export type RetrievalQuery = Readonly<{
  businessId: string;
  query: string;
  topK?: number;
  similarityThreshold?: number;
  /** Dependency-injection seam for deterministic tests and future providers. */
  provider?: EmbeddingProvider;
}>;

export type RetrievedChunk = Readonly<{
  chunkId: string;
  documentId: string;
  content: string;
  metadata: Record<string, unknown>;
  /** Cosine similarity, where 1 is identical and 0 is orthogonal. */
  similarity: number;
}>;
