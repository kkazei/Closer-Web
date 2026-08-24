import "server-only";

import { getMembership } from "@/data/memberships";
import {
  beginKnowledgeDocumentIngestion,
  getKnowledgeDocumentByBusinessId,
  markKnowledgeDocumentIngestionFailed,
} from "@/data/knowledge-documents";
import {
  replaceDocumentChunksWithEmbeddings,
} from "@/data/document-chunks";
import type { EmbeddedDocumentChunkInput } from "@/data/types";
import { notFound } from "@/data/internal";
import { assertUuid } from "@/data/validation";
import { withAuthenticatedDb } from "@/db";

import {
  chunkDocumentText,
  MAX_DOCUMENT_CHARACTERS,
} from "./chunking";
import {
  assertEmbeddingDimensions,
  createHuggingFaceEmbeddingProvider,
  type EmbeddingProviderError,
} from "./embeddings";
import type {
  KnowledgeIngestionInput,
  KnowledgeIngestionResult,
} from "./types";

export const MAX_INGESTION_MILLISECONDS = 120_000;

function isManagerRole(role: string): boolean {
  return role === "owner" || role === "admin";
}

function failureCategory(error: unknown): string {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code: unknown }).code)
    : "PROCESSING_ERROR";
}

function assertIngestionDeadline(startedAt: number): void {
  if (Date.now() - startedAt > MAX_INGESTION_MILLISECONDS) {
    throw new Error("Knowledge ingestion exceeded its time limit.");
  }
}

function buildChunkMetadata(
  chunkIndex: number,
  sourceUri: string | null,
): Record<string, unknown> {
  return {
    chunkIndex,
    ...(sourceUri ? { source: sourceUri } : {}),
  };
}

async function authorizeAndMarkProcessing(
  input: KnowledgeIngestionInput,
): Promise<{ businessId: string; documentId: string; sourceUri: string | null }> {
  const businessId = assertUuid(input.businessId, "businessId");
  const documentId = assertUuid(input.documentId, "documentId");
  const authenticatedUserId = assertUuid(
    input.authenticatedUserId,
    "authenticatedUserId",
  );

  return withAuthenticatedDb({ userId: authenticatedUserId }, async () => {
    const membership = await getMembership(businessId, authenticatedUserId);

    if (!membership || !isManagerRole(membership.role)) {
      throw new Error(
        "Only business owners and administrators may ingest documents.",
      );
    }

    const document = await getKnowledgeDocumentByBusinessId(
      businessId,
      documentId,
    );

    if (!document || document.status === "archived") {
      notFound("Knowledge document");
    }

    if (document.status === "processing") {
      throw new Error("The knowledge document is already being processed.");
    }

    await beginKnowledgeDocumentIngestion(businessId, documentId);

    return {
      businessId,
      documentId,
      sourceUri: document.sourceUri,
    };
  });
}

function assertProviderVector(vector: number[]): number[] {
  try {
    return assertEmbeddingDimensions(vector);
  } catch {
    throw new Error("The embedding provider returned an invalid vector.");
  }
}

/**
 * Ingests one plain-text document for an already-authenticated owner/admin.
 * Authorization runs in the RLS-aware request context. Only the final,
 * server-trusted chunk replacement uses privileged database access, and that
 * replacement also marks the document ready in the same transaction.
 */
export async function ingestKnowledgeDocument(
  input: KnowledgeIngestionInput,
): Promise<KnowledgeIngestionResult> {
  if (typeof input.content !== "string") {
    throw new Error("Document content must be text.");
  }

  if (input.content.length > MAX_DOCUMENT_CHARACTERS) {
    throw new Error("Document content exceeds the supported input limit.");
  }

  const authorizedDocument = await authorizeAndMarkProcessing(input);
  const startedAt = Date.now();
  const provider = input.provider ?? createHuggingFaceEmbeddingProvider();

  try {
    const chunks = chunkDocumentText(input.content);
    const embeddedChunks: EmbeddedDocumentChunkInput[] = [];

    for (const chunk of chunks) {
      assertIngestionDeadline(startedAt);
      const embedding = assertProviderVector(
        await provider.embedText(chunk.content),
      );

      embeddedChunks.push({
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        metadata: buildChunkMetadata(
          chunk.chunkIndex,
          authorizedDocument.sourceUri,
        ),
        embedding,
        embeddingModel: provider.model,
      });
    }

    assertIngestionDeadline(startedAt);

    const persistedChunks = await replaceDocumentChunksWithEmbeddings(
      authorizedDocument.businessId,
      authorizedDocument.documentId,
      embeddedChunks,
    );

    return {
      businessId: authorizedDocument.businessId,
      documentId: authorizedDocument.documentId,
      status: "ready",
      chunkCount: persistedChunks.length,
      embeddingModel: provider.model,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    console.error("Knowledge document ingestion failed.", {
      businessId: authorizedDocument.businessId,
      documentId: authorizedDocument.documentId,
      category: failureCategory(error),
    });

    try {
      await markKnowledgeDocumentIngestionFailed(
        authorizedDocument.businessId,
        authorizedDocument.documentId,
      );
    } catch {
      console.error("Knowledge document failure status could not be stored.", {
        businessId: authorizedDocument.businessId,
        documentId: authorizedDocument.documentId,
      });
    }

    const providerError = error as Partial<EmbeddingProviderError>;

    if (providerError.code === "CONFIGURATION") {
      throw new Error("Knowledge embeddings are not configured.");
    }

    throw new Error("Knowledge document ingestion failed.");
  }
}
