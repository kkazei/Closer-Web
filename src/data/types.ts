export type JsonObject = Record<string, unknown>;

export type BusinessContext = Readonly<{
  businessId: string;
  profileId?: string;
}>;

export const MEMBERSHIP_ROLES = ["owner", "admin", "member"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const LEAD_STATUSES = [
  "new",
  "qualifying",
  "qualified",
  "unqualified",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const CHAT_SESSION_STATUSES = [
  "active",
  "completed",
  "expired",
  "archived",
] as const;
export type ChatSessionStatus = (typeof CHAT_SESSION_STATUSES)[number];

export const MESSAGE_ROLES = ["user", "assistant", "system"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const MESSAGE_STATUSES = ["completed", "error"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const DOCUMENT_STATUSES = [
  "draft",
  "processing",
  "ready",
  "failed",
  "archived",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export type BusinessDTO = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
};

export type MembershipDTO = {
  businessId: string;
  profileId: string;
  role: MembershipRole;
  createdAt: Date;
};

export type ProfileDTO = {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ProfileProvisioningInput = {
  fullName?: string | null;
  avatarUrl?: string | null;
};

export type LeadDTO = {
  id: string;
  businessId: string;
  name: string | null;
  email: string | null;
  company: string | null;
  role: string | null;
  companySize: string | null;
  useCase: string | null;
  budget: string | null;
  timeline: string | null;
  productInterest: string | null;
  buyingIntent: string | null;
  qualificationStatus: LeadStatus;
  score: number | null;
  scoreExplanation: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateLeadInput = {
  name?: string | null;
  email?: string | null;
  company?: string | null;
  role?: string | null;
  companySize?: string | null;
  useCase?: string | null;
  budget?: string | null;
  timeline?: string | null;
  productInterest?: string | null;
  buyingIntent?: string | null;
  qualificationStatus?: LeadStatus;
};

export type UpdateLeadInput = Partial<CreateLeadInput>;

export type LeadListOptions = {
  status?: LeadStatus;
  limit?: number;
  offset?: number;
};

export type ChatSessionDTO = {
  id: string;
  businessId: string;
  visitorId: string;
  leadId: string | null;
  status: ChatSessionStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateChatSessionInput = {
  visitorId?: string;
  leadId?: string | null;
  status?: ChatSessionStatus;
  expiresAt?: Date;
};

export type ChatSessionListOptions = {
  status?: ChatSessionStatus;
  limit?: number;
  offset?: number;
};

export type MessageDTO = {
  id: string;
  businessId: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  provider: string | null;
  model: string | null;
  createdAt: Date;
};

export type CreateMessageInput = {
  sessionId: string;
  role: MessageRole;
  content: string;
  status?: MessageStatus;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  provider?: string | null;
  model?: string | null;
};

export type KnowledgeDocumentDTO = {
  id: string;
  businessId: string;
  createdByProfileId: string | null;
  name: string;
  documentType: string;
  sourceUri: string | null;
  status: DocumentStatus;
  metadata: JsonObject;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateKnowledgeDocumentInput = {
  createdByProfileId?: string | null;
  name: string;
  documentType: string;
  sourceUri?: string | null;
  status?: DocumentStatus;
  metadata?: JsonObject;
};

export type KnowledgeDocumentListOptions = {
  status?: DocumentStatus;
  limit?: number;
  offset?: number;
};

export type DocumentChunkDTO = {
  id: string;
  businessId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  metadata: JsonObject;
  createdAt: Date;
};

export type CreateDocumentChunkInput = {
  chunkIndex: number;
  content: string;
  metadata?: JsonObject;
};
