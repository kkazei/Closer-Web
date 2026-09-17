import "server-only";

import { redirect } from "next/navigation";

import { getMembershipsForProfile, getProfileById } from "@/data";
import { withAuthenticatedDb } from "@/db";

import { getTokenFromCookies } from "./session";
import type { AuthenticatedUser } from "./types";

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const token = await getTokenFromCookies();

  if (!token) {
    return null;
  }

  return withAuthenticatedDb({ userId: token.userId }, async () => {
    const profile = await getProfileById(token.userId);

    if (!profile) {
      return null;
    }

    const memberships = await getMembershipsForProfile(token.userId);

    return {
      userId: token.userId,
      email: profile.email ?? token.email,
      profile,
      memberships,
    };
  });
}

export const getCurrentAuthenticatedUser = getAuthenticatedUser;

export async function requireAuth(): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}
