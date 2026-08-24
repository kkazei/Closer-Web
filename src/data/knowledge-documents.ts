import "server-only";

import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { and, desc, eq, inArray } from "drizzle-orm";

import { db, privilegedDb } from "@/db";
import { knowledgeDocuments } from "@/db/schema";

import { withDataAccess, notFound } from "./internal";
import {
  assertEnumValue,
  assertJsonObject,
  assertListLimit,
  assertListOffset,
  assertNonBlank,
  assertOptionalUuid,
  assertUuid,
  toJsonObject,
} from "./validation";
import {
  DOCUMENT_STATUSES,
  type CreateKnowledgeDocumentInput,
  type DocumentStatus,
  type KnowledgeDocumentDTO,
  type KnowledgeDocumentListOptions,
} from "./types";

const knowledgeDocumentSelection = {
  id: knowledgeDocuments.id,
  businessId: knowledgeDocuments.businessId,
  createdByProfileId: knowledgeDocuments.createdByProfileId,
  name: knowledgeDocuments.name,
  documentType: knowledgeDocuments.documentType,
  sourceUri: knowledgeDocuments.sourceUri,
  status: knowledgeDocuments.status,
  metadata: knowledgeDocuments.metadata,
  createdAt: knowledgeDocuments.createdAt,
  updatedAt: knowledgeDocuments.updatedAt,
};

type KnowledgeDocumentRow = Pick<
  InferSelectModel<typeof knowledgeDocuments>,
  | "id"
  | "businessId"
  | "createdByProfileId"
  | "name"
  | "documentType"
  | "sourceUri"
  | "status"
  | "metadata"
  | "createdAt"
  | "updatedAt"
>;

function toKnowledgeDocumentDTO(
  row: KnowledgeDocumentRow,
): KnowledgeDocumentDTO {
  return {
    id: row.id,
    businessId: row.businessId,
    createdByProfileId: row.createdByProfileId,
    name: row.name,
    documentType: row.documentType,
    sourceUri: row.sourceUri,
    status: row.status,
    metadata: toJsonObject(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeDocumentStatus(status: string): DocumentStatus {
  return assertEnumValue(status, DOCUMENT_STATUSES, "status");
}

function buildDocumentConditions(
  businessId: string,
  status: DocumentStatus | undefined,
) {
  const conditions = [eq(knowledgeDocuments.businessId, businessId)];

  if (status) {
    conditions.push(eq(knowledgeDocuments.status, status));
  }

  return conditions;
}

export async function getKnowledgeDocumentByBusinessId(
  businessId: string,
  documentId: string,
): Promise<KnowledgeDocumentDTO | null> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");
  const normalizedDocumentId = assertUuid(documentId, "documentId");

  return withDataAccess("load knowledge document", async () => {
    const [row] = await db
      .select(knowledgeDocumentSelection)
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.businessId, normalizedBusinessId),
          eq(knowledgeDocuments.id, normalizedDocumentId),
        ),
      )
      .limit(1);

    return row ? toKnowledgeDocumentDTO(row) : null;
  });
}

export async function listKnowledgeDocumentsByBusinessId(
  businessId: string,
  options: KnowledgeDocumentListOptions = {},
): Promise<KnowledgeDocumentDTO[]> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");
  const normalizedStatus = options.status
    ? normalizeDocumentStatus(options.status)
    : undefined;
  const limit = assertListLimit(options.limit);
  const offset = assertListOffset(options.offset);

  return withDataAccess("list knowledge documents", async () => {
    const rows = await db
      .select(knowledgeDocumentSelection)
      .from(knowledgeDocuments)
      .where(
        and(
          ...buildDocumentConditions(normalizedBusinessId, normalizedStatus),
        ),
      )
      .orderBy(desc(knowledgeDocuments.updatedAt), desc(knowledgeDocuments.id))
      .limit(limit)
      .offset(offset);

    return rows.map(toKnowledgeDocumentDTO);
  });
}

export async function createKnowledgeDocument(
  businessId: string,
  input: CreateKnowledgeDocumentInput,
): Promise<KnowledgeDocumentDTO> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");
  const normalizedCreatedByProfileId = assertOptionalUuid(
    input.createdByProfileId,
    "createdByProfileId",
  );
  const values: InferInsertModel<typeof knowledgeDocuments> = {
    businessId: normalizedBusinessId,
    createdByProfileId: normalizedCreatedByProfileId ?? null,
    name: assertNonBlank(input.name, "name"),
    documentType: assertNonBlank(input.documentType, "documentType"),
    sourceUri: input.sourceUri ?? null,
    status: input.status ? normalizeDocumentStatus(input.status) : "draft",
    metadata: input.metadata
      ? assertJsonObject(input.metadata, "metadata")
      : {},
  };

  return withDataAccess("create knowledge document", async () => {
    const [row] = await db
      .insert(knowledgeDocuments)
      .values(values)
      .returning(knowledgeDocumentSelection);

    if (!row) {
      throw new Error("The knowledge document was not created.");
    }

    return toKnowledgeDocumentDTO(row);
  });
}

export async function updateKnowledgeDocumentStatus(
  businessId: string,
  documentId: string,
  status: DocumentStatus,
): Promise<KnowledgeDocumentDTO> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");
  const normalizedDocumentId = assertUuid(documentId, "documentId");
  const normalizedStatus = normalizeDocumentStatus(status);

  return withDataAccess("update knowledge document status", async () => {
    const [row] = await db
      .update(knowledgeDocuments)
      .set({ status: normalizedStatus, updatedAt: new Date() })
      .where(
        and(
          eq(knowledgeDocuments.businessId, normalizedBusinessId),
          eq(knowledgeDocuments.id, normalizedDocumentId),
        ),
      )
      .returning(knowledgeDocumentSelection);

    if (!row) {
      notFound("Knowledge document");
    }

    return toKnowledgeDocumentDTO(row);
  });
}

/**
 * Atomically claims a document for ingestion. The status predicate prevents
 * two concurrent owner/admin requests from both replacing the same document.
 */
export async function beginKnowledgeDocumentIngestion(
  businessId: string,
  documentId: string,
): Promise<KnowledgeDocumentDTO> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");
  const normalizedDocumentId = assertUuid(documentId, "documentId");

  return withDataAccess("start knowledge document ingestion", async () => {
    const [row] = await db
      .update(knowledgeDocuments)
      .set({ status: "processing", updatedAt: new Date() })
      .where(
        and(
          eq(knowledgeDocuments.businessId, normalizedBusinessId),
          eq(knowledgeDocuments.id, normalizedDocumentId),
          inArray(knowledgeDocuments.status, ["draft", "ready", "failed"]),
        ),
      )
      .returning(knowledgeDocumentSelection);

    if (!row) {
      throw new Error("The knowledge document is already being processed.");
    }

    return toKnowledgeDocumentDTO(row);
  });
}

export async function archiveKnowledgeDocument(
  businessId: string,
  documentId: string,
): Promise<KnowledgeDocumentDTO> {
  return updateKnowledgeDocumentStatus(businessId, documentId, "archived");
}

/** Marks a failed ingestion without changing or deleting existing chunks. */
export async function markKnowledgeDocumentIngestionFailed(
  businessId: string,
  documentId: string,
): Promise<void> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");
  const normalizedDocumentId = assertUuid(documentId, "documentId");

  await privilegedDb
    .update(knowledgeDocuments)
    .set({ status: "failed", updatedAt: new Date() })
    .where(
      and(
        eq(knowledgeDocuments.businessId, normalizedBusinessId),
        eq(knowledgeDocuments.id, normalizedDocumentId),
        eq(knowledgeDocuments.status, "processing"),
      ),
    );
}
