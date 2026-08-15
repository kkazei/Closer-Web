import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { businesses } from "./businesses";
import { chatSessions } from "./chat-sessions";
import { messageRole, messageStatus } from "./enums";

export const messages = pgTable(
  "messages",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    businessId: uuid("business_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    role: messageRole("role").notNull(),
    content: text("content").notNull(),
    status: messageStatus("status").default("completed").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    provider: text("provider"),
    model: text("model"),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.businessId],
      foreignColumns: [businesses.id],
      name: "messages_business_id_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.businessId, table.sessionId],
      foreignColumns: [chatSessions.businessId, chatSessions.id],
      name: "messages_business_session_fk",
    }).onDelete("cascade"),
    index("messages_business_session_created_at_id_idx").on(
      table.businessId,
      table.sessionId,
      table.createdAt,
      table.id,
    ),
    check(
      "messages_content_not_blank",
      sql`length(trim(${table.content})) > 0`,
    ),
    check(
      "messages_token_counts_non_negative",
      sql`(${table.inputTokens} is null or ${table.inputTokens} >= 0)
        and (${table.outputTokens} is null or ${table.outputTokens} >= 0)
        and (${table.totalTokens} is null or ${table.totalTokens} >= 0)`,
    ),
    check(
      "messages_metadata_object",
      sql`jsonb_typeof(${table.metadata}) = 'object'`,
    ),
  ],
);
