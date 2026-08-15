import "server-only";

import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { eq } from "drizzle-orm";

import { db, privilegedDb } from "@/db";
import { profiles } from "@/db/schema";

import { withDataAccess } from "./internal";
import { assertUuid } from "./validation";
import type {
  ProfileDTO,
  ProfileProvisioningInput,
} from "./types";

const profileSelection = {
  id: profiles.id,
  fullName: profiles.fullName,
  avatarUrl: profiles.avatarUrl,
  createdAt: profiles.createdAt,
  updatedAt: profiles.updatedAt,
};

type ProfileRow = Pick<
  InferSelectModel<typeof profiles>,
  "id" | "fullName" | "avatarUrl" | "createdAt" | "updatedAt"
>;

function toProfileDTO(row: ProfileRow): ProfileDTO {
  return {
    id: row.id,
    fullName: row.fullName,
    avatarUrl: row.avatarUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getProfileById(
  profileId: string,
): Promise<ProfileDTO | null> {
  const normalizedProfileId = assertUuid(profileId, "profileId");

  return withDataAccess("load profile", async () => {
    const [row] = await db
      .select(profileSelection)
      .from(profiles)
      .where(eq(profiles.id, normalizedProfileId))
      .limit(1);

    return row ? toProfileDTO(row) : null;
  });
}

/**
 * Creates the application profile for a verified Supabase Auth user.
 * The Auth UUID is the profile primary key; this function never generates a
 * second identity and keeps an existing profile unchanged on repeat calls.
 */
export async function ensureProfileForAuthUser(
  authUserId: string,
  input: ProfileProvisioningInput = {},
): Promise<ProfileDTO> {
  const normalizedAuthUserId = assertUuid(authUserId, "authUserId");
  const values: InferInsertModel<typeof profiles> = {
    id: normalizedAuthUserId,
    fullName: input.fullName ?? null,
    avatarUrl: input.avatarUrl ?? null,
  };

  return withDataAccess("provision profile", async () => {
    // Profile provisioning runs immediately after Supabase Auth creates or
    // signs in a user. It is a trusted server operation, not a user-scoped
    // data query, so it must name the privileged handle explicitly.
    const [inserted] = await privilegedDb
      .insert(profiles)
      .values(values)
      .onConflictDoNothing({ target: profiles.id })
      .returning(profileSelection);

    if (inserted) {
      return toProfileDTO(inserted);
    }

    const [existing] = await privilegedDb
      .select(profileSelection)
      .from(profiles)
      .where(eq(profiles.id, normalizedAuthUserId))
      .limit(1);

    if (!existing) {
      throw new Error("The profile could not be provisioned.");
    }

    return existing;
  });
}
