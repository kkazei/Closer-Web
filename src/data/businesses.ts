import "server-only";

import type { InferSelectModel } from "drizzle-orm";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { businesses, businessMemberships } from "@/db/schema";

import { withDataAccess } from "./internal";
import { assertNonBlank, assertUuid } from "./validation";
import type { BusinessDTO } from "./types";

const businessSelection = {
  id: businesses.id,
  name: businesses.name,
  slug: businesses.slug,
  createdAt: businesses.createdAt,
  updatedAt: businesses.updatedAt,
};

type BusinessRow = Pick<
  InferSelectModel<typeof businesses>,
  "id" | "name" | "slug" | "createdAt" | "updatedAt"
>;

function toBusinessDTO(row: BusinessRow): BusinessDTO {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getBusinessById(
  businessId: string,
): Promise<BusinessDTO | null> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");

  return withDataAccess("load business", async () => {
    const [row] = await db
      .select(businessSelection)
      .from(businesses)
      .where(eq(businesses.id, normalizedBusinessId))
      .limit(1);

    return row ? toBusinessDTO(row) : null;
  });
}

export async function getBusinessBySlug(slug: string): Promise<BusinessDTO | null> {
  const normalizedSlug = assertNonBlank(slug, "slug").trim();

  return withDataAccess("load business", async () => {
    const [row] = await db
      .select(businessSelection)
      .from(businesses)
      .where(eq(businesses.slug, normalizedSlug))
      .limit(1);

    return row ? toBusinessDTO(row) : null;
  });
}

/**
 * Lists only active businesses that the verified profile belongs to. The
 * membership join is deliberately part of the DAL query so a caller never
 * has to treat a client-selected business ID as proof of access.
 */
export async function listBusinessesForProfileId(
  profileId: string,
): Promise<BusinessDTO[]> {
  const normalizedProfileId = assertUuid(profileId, "profileId");

  return withDataAccess("list profile businesses", async () => {
    const rows = await db
      .select(businessSelection)
      .from(businesses)
      .innerJoin(
        businessMemberships,
        and(
          eq(businessMemberships.businessId, businesses.id),
          eq(businessMemberships.profileId, normalizedProfileId),
        ),
      )
      .where(isNull(businesses.archivedAt))
      .orderBy(asc(businesses.name), asc(businesses.id));

    return rows.map((business) => toBusinessDTO(business));
  });
}
