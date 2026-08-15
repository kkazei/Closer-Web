import "server-only";

import type { InferSelectModel } from "drizzle-orm";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { businesses } from "@/db/schema";

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
