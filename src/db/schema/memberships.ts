import {
  foreignKey,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { businesses } from "./businesses";
import { membershipRole } from "./enums";
import { profiles } from "./profiles";

export const businessMemberships = pgTable(
  "business_memberships",
  {
    businessId: uuid("business_id").notNull(),
    profileId: uuid("profile_id").notNull(),
    role: membershipRole("role").default("member").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.businessId],
      foreignColumns: [businesses.id],
      name: "business_memberships_business_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.profileId],
      foreignColumns: [profiles.id],
      name: "business_memberships_profile_id_fk",
    }).onDelete("cascade"),
    primaryKey({
      columns: [table.businessId, table.profileId],
      name: "business_memberships_pkey",
    }),
  ],
);
