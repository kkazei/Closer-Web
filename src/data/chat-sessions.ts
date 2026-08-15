import "server-only";

import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { chatSessions } from "@/db/schema";

import { getLeadByBusinessId } from "./leads";
import { withDataAccess, notFound } from "./internal";
import {
  assertDate,
  assertEnumValue,
  assertListLimit,
  assertListOffset,
  assertOptionalUuid,
  assertUuid,
} from "./validation";
import {
  CHAT_SESSION_STATUSES,
  type ChatSessionDTO,
  type ChatSessionListOptions,
  type ChatSessionStatus,
  type CreateChatSessionInput,
} from "./types";

const chatSessionSelection = {
  id: chatSessions.id,
  businessId: chatSessions.businessId,
  visitorId: chatSessions.visitorId,
  leadId: chatSessions.leadId,
  status: chatSessions.status,
  expiresAt: chatSessions.expiresAt,
  createdAt: chatSessions.createdAt,
  updatedAt: chatSessions.updatedAt,
};

type ChatSessionRow = Pick<
  InferSelectModel<typeof chatSessions>,
  | "id"
  | "businessId"
  | "visitorId"
  | "leadId"
  | "status"
  | "expiresAt"
  | "createdAt"
  | "updatedAt"
>;

function toChatSessionDTO(row: ChatSessionRow): ChatSessionDTO {
  return {
    id: row.id,
    businessId: row.businessId,
    visitorId: row.visitorId,
    leadId: row.leadId,
    status: row.status,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeSessionStatus(status: string): ChatSessionStatus {
  return assertEnumValue(status, CHAT_SESSION_STATUSES, "status");
}

function buildSessionConditions(
  businessId: string,
  status: ChatSessionStatus | undefined,
) {
  const conditions = [eq(chatSessions.businessId, businessId)];

  if (status) {
    conditions.push(eq(chatSessions.status, status));
  }

  return conditions;
}

export async function getChatSessionByBusinessId(
  businessId: string,
  sessionId: string,
): Promise<ChatSessionDTO | null> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");
  const normalizedSessionId = assertUuid(sessionId, "sessionId");

  return withDataAccess("load chat session", async () => {
    const [row] = await db
      .select(chatSessionSelection)
      .from(chatSessions)
      .where(
        and(
          eq(chatSessions.businessId, normalizedBusinessId),
          eq(chatSessions.id, normalizedSessionId),
        ),
      )
      .limit(1);

    return row ? toChatSessionDTO(row) : null;
  });
}

export async function createChatSession(
  businessId: string,
  input: CreateChatSessionInput = {},
): Promise<ChatSessionDTO> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");
  const values: InferInsertModel<typeof chatSessions> = {
    businessId: normalizedBusinessId,
  };

  if (input.visitorId !== undefined) {
    values.visitorId = assertUuid(input.visitorId, "visitorId");
  }

  if (input.leadId !== undefined) {
    values.leadId = assertOptionalUuid(input.leadId, "leadId");
  }

  if (input.status !== undefined) {
    values.status = normalizeSessionStatus(input.status);
  }

  if (input.expiresAt !== undefined) {
    values.expiresAt = assertDate(input.expiresAt, "expiresAt");
  }

  if (values.leadId) {
    const lead = await getLeadByBusinessId(normalizedBusinessId, values.leadId);

    if (!lead) {
      notFound("Lead");
    }
  }

  return withDataAccess("create chat session", async () => {
    const [row] = await db
      .insert(chatSessions)
      .values(values)
      .returning(chatSessionSelection);

    if (!row) {
      throw new Error("The chat session was not created.");
    }

    return toChatSessionDTO(row);
  });
}

export async function associateChatSessionWithLead(
  businessId: string,
  sessionId: string,
  leadId: string,
): Promise<ChatSessionDTO> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");
  const normalizedSessionId = assertUuid(sessionId, "sessionId");
  const normalizedLeadId = assertUuid(leadId, "leadId");

  const lead = await getLeadByBusinessId(normalizedBusinessId, normalizedLeadId);

  if (!lead) {
    notFound("Lead");
  }

  return withDataAccess("associate chat session with lead", async () => {
    const [row] = await db
      .update(chatSessions)
      .set({ leadId: normalizedLeadId, updatedAt: new Date() })
      .where(
        and(
          eq(chatSessions.businessId, normalizedBusinessId),
          eq(chatSessions.id, normalizedSessionId),
        ),
      )
      .returning(chatSessionSelection);

    if (!row) {
      notFound("Chat session");
    }

    return toChatSessionDTO(row);
  });
}

export async function listChatSessionsByBusinessId(
  businessId: string,
  options: ChatSessionListOptions = {},
): Promise<ChatSessionDTO[]> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");
  const normalizedStatus = options.status
    ? normalizeSessionStatus(options.status)
    : undefined;
  const limit = assertListLimit(options.limit);
  const offset = assertListOffset(options.offset);

  return withDataAccess("list chat sessions", async () => {
    const rows = await db
      .select(chatSessionSelection)
      .from(chatSessions)
      .where(and(...buildSessionConditions(normalizedBusinessId, normalizedStatus)))
      .orderBy(desc(chatSessions.updatedAt), desc(chatSessions.id))
      .limit(limit)
      .offset(offset);

    return rows.map(toChatSessionDTO);
  });
}

export async function listChatSessionsByLeadId(
  businessId: string,
  leadId: string,
  options: Omit<ChatSessionListOptions, "status"> = {},
): Promise<ChatSessionDTO[]> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");
  const normalizedLeadId = assertUuid(leadId, "leadId");
  const limit = assertListLimit(options.limit);
  const offset = assertListOffset(options.offset);

  return withDataAccess("list lead chat sessions", async () => {
    const rows = await db
      .select(chatSessionSelection)
      .from(chatSessions)
      .where(
        and(
          eq(chatSessions.businessId, normalizedBusinessId),
          eq(chatSessions.leadId, normalizedLeadId),
        ),
      )
      .orderBy(desc(chatSessions.updatedAt), desc(chatSessions.id))
      .limit(limit)
      .offset(offset);

    return rows.map(toChatSessionDTO);
  });
}
