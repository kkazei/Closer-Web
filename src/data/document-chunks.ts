import "server-only";

import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { and, asc, eq } from "drizzle-orm";

import { db, privilegedDb } from "@/db";
import { documentChunks, knowledgeDocuments } from "@/db/schema";

import { getKnowledgeDocumentByBusinessId } from "./knowledge-documents";
import { withDataAccess, invalidInput, notFound } from "./internal";
import {
  assertJsonObject,
  assertNonBlank,
  assertNonNegativeInteger,
  assertUuid,
  toJsonObject,
} from "./validation";
import type {
  CreateDocumentChunkInput,
  DocumentChunkDTO,
  EmbeddedDocumentChunkInput,
} from "./types";

const documentChunkSelection = {
  id: documentChunks.id,
  businessId: documentChunks.businessId,
  documentId: documentChunks.documentId,
  chunkIndex: documentChunks.chunkIndex,
  content: documentChunks.content,
  metadata: documentChunks.metadata,
  createdAt: documentChunks.createdAt,
};

type DocumentChunkRow = Pick<
  InferSelectModel<typeof documentChunks>,
  | "id"
  | "businessId"
  | "documentId"
  | "chunkIndex"
  | "content"
  | "metadata"
  | "createdAt"
>;

function toDocumentChunkDTO(row: DocumentChunkRow): DocumentChunkDTO {
  return {
    id: row.id,
    businessId: row.businessId,
    documentId: row.documentId,
    chunkIndex: row.chunkIndex,
    content: row.content,
    metadata: toJsonObject(row.metadata),
    createdAt: row.createdAt,
  };
}

function buildChunkValues(
  businessId: string,
  documentId: string,
  input: CreateDocumentChunkInput,
): InferInsertModel<typeof documentChunks> {
  return {
    businessId,
    documentId,
    chunkIndex: assertNonNegativeInteger(input.chunkIndex, "chunkIndex"),
    content: assertNonBlank(input.content, "content"),
    metadata: input.metadata
      ? assertJsonObject(input.metadata, "metadata")
      : {},
    embedding: null,
    embeddingModel: null,
  };
}

async function assertDocumentExists(
  businessId: string,
  documentId: string,
): Promise<void> {
  const document = await getKnowledgeDocumentByBusinessId(businessId, documentId);

  if (!document) {
    notFound("Knowledge document");
  }
}

export async function listDocumentChunksByDocumentId(
  businessId: string,
  documentId: string,
): Promise<DocumentChunkDTO[]> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");
  const normalizedDocumentId = assertUuid(documentId, "documentId");

  return withDataAccess("list document chunks", async () => {
    const rows = await db
      .select(documentChunkSelection)
      .from(documentChunks)
      .where(
        and(
          eq(documentChunks.businessId, normalizedBusinessId),
          eq(documentChunks.documentId, normalizedDocumentId),
        ),
      )
      .orderBy(asc(documentChunks.chunkIndex));

    return rows.map(toDocumentChunkDTO);
  });
}

export async function createDocumentChunks(
  businessId: string,
  documentId: string,
  inputs: CreateDocumentChunkInput[],
): Promise<DocumentChunkDTO[]> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");
  const normalizedDocumentId = assertUuid(documentId, "documentId");

  if (inputs.length === 0) {
    invalidInput("At least one document chunk is required.");
  }

  await assertDocumentExists(normalizedBusinessId, normalizedDocumentId);
  const values = inputs.map((input) =>
    buildChunkValues(normalizedBusinessId, normalizedDocumentId, input),
  );

  return withDataAccess("create document chunks", async () => {
    const rows = await db
      .insert(documentChunks)
      .values(values)
      .returning(documentChunkSelection);

    return rows.map(toDocumentChunkDTO);
  });
}

export async function replaceDocumentChunks(
  businessId: string,
  documentId: string,
  inputs: CreateDocumentChunkInput[],
): Promise<DocumentChunkDTO[]> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");
  const normalizedDocumentId = assertUuid(documentId, "documentId");

  await assertDocumentExists(normalizedBusinessId, normalizedDocumentId);
  const values = inputs.map((input) =>
    buildChunkValues(normalizedBusinessId, normalizedDocumentId, input),
  );

  return withDataAccess("replace document chunks", async () =>
    db.transaction(async (transaction) => {
      await transaction
        .delete(documentChunks)
        .where(
          and(
            eq(documentChunks.businessId, normalizedBusinessId),
            eq(documentChunks.documentId, normalizedDocumentId),
          ),
        );

      if (values.length === 0) {
        return [];
      }

      const rows = await transaction
        .insert(documentChunks)
        .values(values)
        .returning(documentChunkSelection);

      return rows.map(toDocumentChunkDTO);
    }),
  );
}

/**
 * Trusted ingestion boundary. Ordinary authenticated clients have SELECT-only
 * access to document_chunks under RLS; this function is used only after the
 * caller has completed request-scoped owner/admin authorization.
 *
 * Chunk replacement and the document's transition to ready are committed in
 * one privileged transaction. If insertion or the status transition fails,
 * the previous chunk set remains intact.
 */
export async function replaceDocumentChunksWithEmbeddings(
  businessId: string,
  documentId: string,
  inputs: EmbeddedDocumentChunkInput[],
): Promise<DocumentChunkDTO[]> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");
  const normalizedDocumentId = assertUuid(documentId, "documentId");

  if (inputs.length === 0) {
    invalidInput("At least one embedded document chunk is required.");
  }

  const values = inputs.map((input) => ({
    businessId: normalizedBusinessId,
    documentId: normalizedDocumentId,
    chunkIndex: assertNonNegativeInteger(input.chunkIndex, "chunkIndex"),
    content: assertNonBlank(input.content, "content"),
    metadata: input.metadata
      ? assertJsonObject(input.metadata, "metadata")
      : {},
    embedding: input.embedding,
    embeddingModel: assertNonBlank(input.embeddingModel, "embeddingModel"),
  }));

  return privilegedDb.transaction(async (transaction) => {
    const [document] = await transaction
      .select({ id: knowledgeDocuments.id })
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.businessId, normalizedBusinessId),
          eq(knowledgeDocuments.id, normalizedDocumentId),
          eq(knowledgeDocuments.status, "processing"),
        ),
      )
      .limit(1);

    if (!document) {
      throw new Error("The document is no longer available for ingestion.");
    }

    await transaction
      .delete(documentChunks)
      .where(
        and(
          eq(documentChunks.businessId, normalizedBusinessId),
          eq(documentChunks.documentId, normalizedDocumentId),
        ),
      );

    const rows = await transaction
      .insert(documentChunks)
      .values(values)
      .returning(documentChunkSelection);

    const [readyDocument] = await transaction
      .update(knowledgeDocuments)
      .set({ status: "ready", updatedAt: new Date() })
      .where(
        and(
          eq(knowledgeDocuments.businessId, normalizedBusinessId),
          eq(knowledgeDocuments.id, normalizedDocumentId),
          eq(knowledgeDocuments.status, "processing"),
        ),
      )
      .returning({ id: knowledgeDocuments.id });

    if (!readyDocument) {
      throw new Error("The document could not be marked ready.");
    }

    return rows.map(toDocumentChunkDTO);
  });
}
