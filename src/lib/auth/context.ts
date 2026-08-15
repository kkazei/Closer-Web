import "server-only";

import { getMembershipsForProfile, getProfileById } from "@/data";
import { assertUuid } from "@/data/validation";
import { createClient } from "@/lib/supabase/server";

import type { AuthenticatedUser } from "./types";

/**
 * Resolves identity only from Supabase's verified JWT claims.
 * A client-supplied user ID is never accepted here.
 */
export async function getCurrentAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims || typeof claims.sub !== "string") {
    return null;
  }

  let userId: string;

  try {
    userId = assertUuid(claims.sub, "authenticated user ID");
  } catch {
    return null;
  }

  const profile = await getProfileById(userId);
  const memberships = await getMembershipsForProfile(userId);
  const email = typeof claims.email === "string" ? claims.email : undefined;

  return { userId, email, profile, memberships };
}
