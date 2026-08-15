import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { businesses } from "./businesses";
import { leadStatus } from "./enums";

export const leads = pgTable(
  "leads",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    businessId: uuid("business_id").notNull(),
    name: text("name"),
    email: text("email"),
    company: text("company"),
    role: text("role"),
    companySize: text("company_size"),
    useCase: text("use_case"),
    budget: text("budget"),
    timeline: text("timeline"),
    productInterest: text("product_interest"),
    buyingIntent: text("buying_intent"),
    qualificationStatus: leadStatus("qualification_status")
      .default("new")
      .notNull(),
    score: smallint("score"),
    scoreBreakdown: jsonb("score_breakdown")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    scoreExplanation: text("score_explanation"),
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
      name: "leads_business_id_fk",
    }).onDelete("restrict"),
    // Required so child tables can reference (business_id, id).
    unique("leads_business_id_id_unique").on(table.businessId, table.id),
    check(
      "leads_score_range",
      sql`${table.score} is null or ${table.score} between 0 and 100`,
    ),
    check(
      "leads_score_breakdown_object",
      sql`jsonb_typeof(${table.scoreBreakdown}) = 'object'`,
    ),
  ],
);
