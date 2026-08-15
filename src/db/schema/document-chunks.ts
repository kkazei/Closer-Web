import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

import { businesses } from "./businesses";
import { knowledgeDocuments } from "./knowledge-documents";

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    businessId: uuid("business_id").notNull(),
    documentId: uuid("document_id").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
    embedding: vector("embedding", { dimensions: 384 }),
    embeddingModel: text("embedding_model"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.businessId],
      foreignColumns: [businesses.id],
      name: "document_chunks_business_id_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.businessId, table.documentId],
      foreignColumns: [knowledgeDocuments.businessId, knowledgeDocuments.id],
      name: "document_chunks_business_document_fk",
    }).onDelete("cascade"),
    unique("document_chunks_business_document_index_unique").on(
      table.businessId,
      table.documentId,
      table.chunkIndex,
    ),
    check(
      "document_chunks_index_non_negative",
      sql`${table.chunkIndex} >= 0`,
    ),
    check(
      "document_chunks_content_not_blank",
      sql`length(trim(${table.content})) > 0`,
    ),
    check(
      "document_chunks_metadata_object",
      sql`jsonb_typeof(${table.metadata}) = 'object'`,
    ),
    check(
      "document_chunks_embedding_model_pair",
      sql`(${table.embedding} is null and ${table.embeddingModel} is null)
        or (${table.embedding} is not null and ${table.embeddingModel} is not null)`,
    ),
  ],
);
