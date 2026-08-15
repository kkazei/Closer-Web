import { pgEnum } from "drizzle-orm/pg-core";

export const membershipRole = pgEnum("membership_role", [
  "owner",
  "admin",
  "member",
]);

export const leadStatus = pgEnum("lead_status", [
  "new",
  "qualifying",
  "qualified",
  "unqualified",
]);

export const chatSessionStatus = pgEnum("chat_session_status", [
  "active",
  "completed",
  "expired",
  "archived",
]);

export const messageRole = pgEnum("message_role", [
  "user",
  "assistant",
  "system",
]);

export const messageStatus = pgEnum("message_status", [
  "completed",
  "error",
]);

export const documentStatus = pgEnum("document_status", [
  "draft",
  "processing",
  "ready",
  "failed",
  "archived",
]);
