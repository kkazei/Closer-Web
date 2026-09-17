import "server-only";

import type { InferSelectModel } from "drizzle-orm";
import { eq, sql } from "drizzle-orm";

import { db, privilegedDb } from "@/db";
import { profiles } from "@/db/schema";

import { withDataAccess } from "./internal";
import { assertUuid } from "./validation";
import type { ProfileDTO } from "./types";

const profileSelection = {
  id: profiles.id,
  email: profiles.email,
  emailVerifiedAt: profiles.emailVerifiedAt,
  fullName: profiles.fullName,
  avatarUrl: profiles.avatarUrl,
  createdAt: profiles.createdAt,
  updatedAt: profiles.updatedAt,
};

type ProfileRow = Pick<
  InferSelectModel<typeof profiles>,
  | "id"
  | "email"
  | "emailVerifiedAt"
  | "fullName"
  | "avatarUrl"
  | "createdAt"
  | "updatedAt"
>;

function toProfileDTO(row: ProfileRow): ProfileDTO {
  return {
    id: row.id,
    email: row.email,
    emailVerifiedAt: row.emailVerifiedAt,
    fullName: row.fullName,
    avatarUrl: row.avatarUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type AuthAccount = Readonly<{
  id: string;
  email: string;
  passwordHash: string;
  fullName: string | null;
  emailVerifiedAt: Date | null;
}>;

const authAccountSelection = {
  id: profiles.id,
  email: profiles.email,
  passwordHash: profiles.passwordHash,
  fullName: profiles.fullName,
  emailVerifiedAt: profiles.emailVerifiedAt,
};

export async function getAuthAccountByEmail(
  email: string,
): Promise<AuthAccount | null> {
  return withDataAccess("load authentication account", async () => {
    const [row] = await privilegedDb
      .select(authAccountSelection)
      .from(profiles)
      .where(sql`lower(${profiles.email}) = ${email}`)
      .limit(1);

    if (!row || row.email === null || row.passwordHash === null) {
      return null;
    }

    return row as AuthAccount;
  });
}

export async function createAuthAccount(input: {
  email: string;
  passwordHash: string;
  fullName?: string | null;
}): Promise<AuthAccount> {
  return withDataAccess("create authentication account", async () => {
    const [row] = await privilegedDb
      .insert(profiles)
      .values({
        email: input.email,
        passwordHash: input.passwordHash,
        fullName: input.fullName ?? null,
      })
      .returning(authAccountSelection);

    if (!row || row.email === null || row.passwordHash === null) {
      throw new Error("The authentication account could not be created.");
    }

    return row as AuthAccount;
  });
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
