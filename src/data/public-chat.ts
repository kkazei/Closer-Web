import "server-only";

import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";

import { privilegedDb } from "@/db";
import { businesses, chatSessions, messages } from "@/db/schema";

import {
  assertEnumValue,
  assertNonBlank,
  assertNonNegativeInteger,
  assertUuid,
} from "./validation";

export type AnonymousChatSession = Readonly<{
  sessionId: string;
  expiresAt: Date;
}>;

export type AnonymousChatContext = Readonly<{
  sessionId: string;
  businessId: string;
  businessName: string;
  expiresAt: Date;
  history: ReadonlyArray<AnonymousChatHistoryMessage>;
}>;

export type AnonymousChatHistoryMessage = Readonly<{
  role: "user" | "assistant";
  content: string;
}>;

type CreateAnonymousChatSessionInput = Readonly<{
  businessSlug: string;
  visitorId: string;
}>;

type InsertAnonymousChatMessageInput = Readonly<{
  sessionId: string;
  visitorId: string;
  role: "user" | "assistant";
  content: string;
  provider?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
}>;

const MAX_HISTORY_MESSAGES = 40;
const ANONYMOUS_MESSAGE_ROLES = ["user", "assistant"] as const;

function optionalTokenCount(
  value: number | null | undefined,
  fieldName: string,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return assertNonNegativeInteger(value, fieldName);
}

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

/**
 * Loads only the anonymous session's tenant and server-owned conversation
 * history. The visitor cookie is required on every lookup so a leaked session
 * UUID is not sufficient to read another visitor's conversation.
 */
export async function getAnonymousChatContext(
  sessionId: string,
  visitorId: string,
  businessSlug: string,
): Promise<AnonymousChatContext | null> {
  const normalizedSessionId = assertUuid(sessionId, "sessionId");
  const normalizedVisitorId = assertUuid(visitorId, "visitorId");
  const normalizedBusinessSlug = assertNonBlank(
    businessSlug,
    "businessSlug",
  ).trim().toLowerCase();

  return privilegedDb.transaction(async (transaction) => {
    const [session] = await transaction
      .select({
        sessionId: chatSessions.id,
        businessId: chatSessions.businessId,
        businessName: businesses.name,
        expiresAt: chatSessions.expiresAt,
      })
      .from(chatSessions)
      .innerJoin(businesses, eq(businesses.id, chatSessions.businessId))
      .where(
        and(
          eq(chatSessions.id, normalizedSessionId),
          eq(chatSessions.visitorId, normalizedVisitorId),
          eq(businesses.slug, normalizedBusinessSlug),
          eq(chatSessions.status, "active"),
          gt(chatSessions.expiresAt, new Date()),
          isNull(businesses.archivedAt),
        ),
      )
      .limit(1);

    if (!session) {
      return null;
    }

    const historyRows = await transaction
      .select({
        role: messages.role,
        content: messages.content,
      })
      .from(messages)
      .where(
        and(
          eq(messages.businessId, session.businessId),
          eq(messages.sessionId, session.sessionId),
          inArray(messages.role, ANONYMOUS_MESSAGE_ROLES),
        ),
      )
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(MAX_HISTORY_MESSAGES);

    return {
      sessionId: session.sessionId,
      businessId: session.businessId,
      businessName: session.businessName,
      expiresAt: session.expiresAt,
      history: historyRows.reverse().flatMap(({ role, content }) =>
        role === "user" || role === "assistant" ? [{ role, content }] : [],
      ),
    };
  });
}

/**
 * Appends a server-authorized user or assistant message and updates the
 * session activity timestamp. The function rechecks the visitor/session
 * relationship so callers cannot write to a session using only its UUID.
 */
export async function insertAnonymousChatMessage(
  input: InsertAnonymousChatMessageInput,
): Promise<{ id: string } | null> {
  const sessionId = assertUuid(input.sessionId, "sessionId");
  const visitorId = assertUuid(input.visitorId, "visitorId");
  const content = assertNonBlank(input.content, "content").trim();
  const role = assertEnumValue(
    input.role,
    ANONYMOUS_MESSAGE_ROLES,
    "role",
  );

  return privilegedDb.transaction(async (transaction) => {
    const [session] = await transaction
      .select({
        sessionId: chatSessions.id,
        businessId: chatSessions.businessId,
      })
      .from(chatSessions)
      .innerJoin(businesses, eq(businesses.id, chatSessions.businessId))
      .where(
        and(
          eq(chatSessions.id, sessionId),
          eq(chatSessions.visitorId, visitorId),
          eq(chatSessions.status, "active"),
          gt(chatSessions.expiresAt, new Date()),
          isNull(businesses.archivedAt),
        ),
      )
      .limit(1);

    if (!session) {
      return null;
    }

    const [message] = await transaction
      .insert(messages)
      .values({
        businessId: session.businessId,
        sessionId: session.sessionId,
        role,
        content,
        status: "completed",
        provider: input.provider ?? null,
        model: input.model ?? null,
        inputTokens: optionalTokenCount(input.inputTokens, "inputTokens"),
        outputTokens: optionalTokenCount(input.outputTokens, "outputTokens"),
        totalTokens:
          input.inputTokens !== null && input.inputTokens !== undefined &&
          input.outputTokens !== null && input.outputTokens !== undefined
            ? assertNonNegativeInteger(
                input.inputTokens + input.outputTokens,
                "totalTokens",
              )
            : null,
      })
      .returning({ id: messages.id });

    if (!message) {
      throw new Error("The anonymous chat message was not created.");
    }

    await transaction
      .update(chatSessions)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(chatSessions.id, session.sessionId),
          eq(chatSessions.businessId, session.businessId),
        ),
      );

    return message;
  });
}
