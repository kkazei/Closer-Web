import "server-only";

import { randomUUID } from "node:crypto";
import type { InferSelectModel } from "drizzle-orm";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db, privilegedDb } from "@/db";
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

/** Creates a business and its initial owner membership atomically. */
export async function createBusinessForOwner(
  name: string,
  ownerProfileId: string,
): Promise<BusinessDTO> {
  const normalizedName = assertNonBlank(name, "name").trim();
  const normalizedOwnerId = assertUuid(ownerProfileId, "ownerProfileId");

  if (normalizedName.length > 100) {
    throw new Error("Business name must be 100 characters or fewer.");
  }

  const id = randomUUID();
  const baseSlug = normalizedName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
  const slug = `${baseSlug || "workspace"}-${id.slice(0, 8)}`;

  return withDataAccess("create business workspace", async () => {
    return privilegedDb.transaction(async (transaction) => {
      const [business] = await transaction
        .insert(businesses)
        .values({ id, name: normalizedName, slug })
        .returning(businessSelection);

      await transaction.insert(businessMemberships).values({
        businessId: id,
        profileId: normalizedOwnerId,
        role: "owner",
      });

      return toBusinessDTO(business);
    });
  });
}
