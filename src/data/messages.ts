import "server-only";

import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { messages } from "@/db/schema";

import { getChatSessionByBusinessId } from "./chat-sessions";
import { withDataAccess, notFound } from "./internal";
import {
  assertEnumValue,
  assertNonBlank,
  assertNonNegativeInteger,
  assertUuid,
} from "./validation";
import {
  MESSAGE_ROLES,
  MESSAGE_STATUSES,
  type CreateMessageInput,
  type MessageDTO,
  type MessageRole,
  type MessageStatus,
} from "./types";

const messageSelection = {
  id: messages.id,
  businessId: messages.businessId,
  sessionId: messages.sessionId,
  role: messages.role,
  content: messages.content,
  status: messages.status,
  inputTokens: messages.inputTokens,
  outputTokens: messages.outputTokens,
  totalTokens: messages.totalTokens,
  provider: messages.provider,
  model: messages.model,
  createdAt: messages.createdAt,
};

type MessageRow = Pick<
  InferSelectModel<typeof messages>,
  | "id"
  | "businessId"
  | "sessionId"
  | "role"
  | "content"
  | "status"
  | "inputTokens"
  | "outputTokens"
  | "totalTokens"
  | "provider"
  | "model"
  | "createdAt"
>;

function toMessageDTO(row: MessageRow): MessageDTO {
  return {
    id: row.id,
    businessId: row.businessId,
    sessionId: row.sessionId,
    role: row.role,
    content: row.content,
    status: row.status,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    totalTokens: row.totalTokens,
    provider: row.provider,
    model: row.model,
    createdAt: row.createdAt,
  };
}

function normalizeMessageRole(role: string): MessageRole {
  return assertEnumValue(role, MESSAGE_ROLES, "role");
}

function normalizeMessageStatus(status: string): MessageStatus {
  return assertEnumValue(status, MESSAGE_STATUSES, "status");
}

function optionalTokenCount(
  value: number | null | undefined,
  fieldName: string,
): number | null | undefined {
  if (value === null || value === undefined) {
    return value;
  }

  return assertNonNegativeInteger(value, fieldName);
}

export async function listMessagesBySessionId(
  businessId: string,
  sessionId: string,
): Promise<MessageDTO[]> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");
  const normalizedSessionId = assertUuid(sessionId, "sessionId");

  return withDataAccess("list session messages", async () => {
    const rows = await db
      .select(messageSelection)
      .from(messages)
      .where(
        and(
          eq(messages.businessId, normalizedBusinessId),
          eq(messages.sessionId, normalizedSessionId),
        ),
      )
      .orderBy(asc(messages.createdAt), asc(messages.id));

    return rows.map(toMessageDTO);
  });
}

export async function insertMessage(
  businessId: string,
  input: CreateMessageInput,
): Promise<MessageDTO> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");
  const normalizedSessionId = assertUuid(input.sessionId, "sessionId");
  const session = await getChatSessionByBusinessId(
    normalizedBusinessId,
    normalizedSessionId,
  );

  if (!session) {
    notFound("Chat session");
  }

  const values: InferInsertModel<typeof messages> = {
    businessId: normalizedBusinessId,
    sessionId: normalizedSessionId,
    role: normalizeMessageRole(input.role),
    content: assertNonBlank(input.content, "content"),
    status: input.status ? normalizeMessageStatus(input.status) : "completed",
    inputTokens: optionalTokenCount(input.inputTokens, "inputTokens"),
    outputTokens: optionalTokenCount(input.outputTokens, "outputTokens"),
    totalTokens: optionalTokenCount(input.totalTokens, "totalTokens"),
    provider: input.provider ?? null,
    model: input.model ?? null,
  };

  return withDataAccess("insert message", async () => {
    const [row] = await db
      .insert(messages)
      .values(values)
      .returning(messageSelection);

    if (!row) {
      throw new Error("The message was not created.");
    }

    return toMessageDTO(row);
  });
}
