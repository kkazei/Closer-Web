import { sql } from "drizzle-orm";
import {
  check,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const businesses = pgTable(
  "businesses",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("businesses_slug_unique").on(table.slug),
    check(
      "businesses_name_not_blank",
      sql`length(trim(${table.name})) > 0`,
    ),
    check(
      "businesses_slug_not_blank",
      sql`length(trim(${table.slug})) > 0`,
    ),
  ],
);
