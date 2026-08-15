import { sql } from "drizzle-orm";
import {
  foreignKey,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { businesses } from "./businesses";
import { chatSessionStatus } from "./enums";
import { leads } from "./leads";

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    businessId: uuid("business_id").notNull(),

    // Generated server-side and eventually persisted in closer_visitor_id.
    // This is pseudonymous browser grouping, not authentication.
    visitorId: uuid("visitor_id")
      .default(sql`gen_random_uuid()`)
      .notNull(),

    leadId: uuid("lead_id"),
    status: chatSessionStatus("status").default("active").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .default(sql`now() + interval '30 days'`)
      .notNull(),
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
      name: "chat_sessions_business_id_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.businessId, table.leadId],
      foreignColumns: [leads.businessId, leads.id],
      name: "chat_sessions_business_lead_fk",
    }).onDelete("restrict"),
    // Required so messages can reference (business_id, id).
    unique("chat_sessions_business_id_id_unique").on(
      table.businessId,
      table.id,
    ),
  ],
);
