import "server-only";

import type { InferSelectModel } from "drizzle-orm";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { businessMemberships } from "@/db/schema";

import { withDataAccess } from "./internal";
import { assertUuid } from "./validation";
import type { MembershipDTO } from "./types";

const membershipSelection = {
  businessId: businessMemberships.businessId,
  profileId: businessMemberships.profileId,
  role: businessMemberships.role,
  createdAt: businessMemberships.createdAt,
};

type MembershipRow = Pick<
  InferSelectModel<typeof businessMemberships>,
  "businessId" | "profileId" | "role" | "createdAt"
>;

function toMembershipDTO(row: MembershipRow): MembershipDTO {
  return {
    businessId: row.businessId,
    profileId: row.profileId,
    role: row.role,
    createdAt: row.createdAt,
  };
}

export async function getMembershipsForProfile(
  profileId: string,
): Promise<MembershipDTO[]> {
  const normalizedProfileId = assertUuid(profileId, "profileId");

  return withDataAccess("load profile memberships", async () => {
    const rows = await db
      .select(membershipSelection)
      .from(businessMemberships)
      .where(eq(businessMemberships.profileId, normalizedProfileId))
      .orderBy(asc(businessMemberships.createdAt));

    return rows.map(toMembershipDTO);
  });
}

export async function getMembership(
  businessId: string,
  profileId: string,
): Promise<MembershipDTO | null> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");
  const normalizedProfileId = assertUuid(profileId, "profileId");

  return withDataAccess("load business membership", async () => {
    const [row] = await db
      .select(membershipSelection)
      .from(businessMemberships)
      .where(
        and(
          eq(businessMemberships.businessId, normalizedBusinessId),
          eq(businessMemberships.profileId, normalizedProfileId),
        ),
      )
      .limit(1);

    return row ? toMembershipDTO(row) : null;
  });
}

export async function profileBelongsToBusiness(
  businessId: string,
  profileId: string,
): Promise<boolean> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");
  const normalizedProfileId = assertUuid(profileId, "profileId");

  return withDataAccess("check business membership", async () => {
    const [row] = await db
      .select({ profileId: businessMemberships.profileId })
      .from(businessMemberships)
      .where(
        and(
          eq(businessMemberships.businessId, normalizedBusinessId),
          eq(businessMemberships.profileId, normalizedProfileId),
        ),
      )
      .limit(1);

    return Boolean(row);
  });
}
