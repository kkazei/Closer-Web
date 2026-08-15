import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { businesses } from "./businesses";
import { documentStatus } from "./enums";
import { profiles } from "./profiles";

export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    businessId: uuid("business_id").notNull(),
    createdByProfileId: uuid("created_by_profile_id"),
    name: text("name").notNull(),
    documentType: text("document_type").notNull(),
    sourceUri: text("source_uri"),
    status: documentStatus("status").default("draft").notNull(),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.businessId],
      foreignColumns: [businesses.id],
      name: "knowledge_documents_business_id_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.createdByProfileId],
      foreignColumns: [profiles.id],
      name: "knowledge_documents_created_by_profile_id_fk",
    }).onDelete("set null"),
    // Required so chunks can reference (business_id, id).
    unique("knowledge_documents_business_id_id_unique").on(
      table.businessId,
      table.id,
    ),
    check(
      "knowledge_documents_name_not_blank",
      sql`length(trim(${table.name})) > 0`,
    ),
    check(
      "knowledge_documents_metadata_object",
      sql`jsonb_typeof(${table.metadata}) = 'object'`,
    ),
  ],
);
