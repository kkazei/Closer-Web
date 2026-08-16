import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { privilegedDb } from "@/db";
import { businesses, chatSessions } from "@/db/schema";

import { assertUuid } from "./validation";

export type AnonymousChatSession = Readonly<{
  sessionId: string;
  expiresAt: Date;
}>;

type CreateAnonymousChatSessionInput = Readonly<{
  businessSlug: string;
  visitorId: string;
}>;

/**
 * Controlled public-chat write boundary.
 *
 * This intentionally does not reuse the authenticated DAL: anonymous users
 * have no direct table access under RLS. The route supplies only a validated
 * public slug and a server-derived visitor UUID; no client business ID or
 * visitor ID is accepted here.
 */
export async function createAnonymousChatSession(
  input: CreateAnonymousChatSessionInput,
): Promise<AnonymousChatSession | null> {
  const visitorId = assertUuid(input.visitorId, "visitorId");
  const businessSlug = input.businessSlug.trim().toLowerCase();

  return privilegedDb.transaction(async (transaction) => {
    const [business] = await transaction
      .select({ id: businesses.id })
      .from(businesses)
      .where(
        and(
          eq(businesses.slug, businessSlug),
          isNull(businesses.archivedAt),
        ),
      )
      .limit(1);

    if (!business) {
      return null;
    }

    const [session] = await transaction
      .insert(chatSessions)
      .values({
        businessId: business.id,
        visitorId,
      })
      .returning({
        sessionId: chatSessions.id,
        expiresAt: chatSessions.expiresAt,
      });

    if (!session) {
      throw new Error("The anonymous chat session was not created.");
    }

    return session;
  });
}
