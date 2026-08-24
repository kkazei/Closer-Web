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
