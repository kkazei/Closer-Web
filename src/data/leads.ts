import "server-only";

import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { and, count, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { leads } from "@/db/schema";

import { DataAccessError } from "./errors";
import { withDataAccess, invalidInput, notFound } from "./internal";
import {
  assertEnumValue,
  assertListLimit,
  assertListOffset,
  assertUuid,
  toJsonObject,
} from "./validation";
import {
  LEAD_STATUSES,
  type CreateLeadInput,
  type LeadDTO,
  type LeadListOptions,
  type LeadStatus,
  type UpdateLeadInput,
} from "./types";

const leadSelection = {
  id: leads.id,
  businessId: leads.businessId,
  name: leads.name,
  email: leads.email,
  company: leads.company,
  role: leads.role,
  companySize: leads.companySize,
  useCase: leads.useCase,
  budget: leads.budget,
  timeline: leads.timeline,
  productInterest: leads.productInterest,
  buyingIntent: leads.buyingIntent,
  qualificationStatus: leads.qualificationStatus,
  score: leads.score,
  scoreBreakdown: leads.scoreBreakdown,
  scoreExplanation: leads.scoreExplanation,
  createdAt: leads.createdAt,
  updatedAt: leads.updatedAt,
};

type LeadRow = Pick<
  InferSelectModel<typeof leads>,
  | "id"
  | "businessId"
  | "name"
  | "email"
  | "company"
  | "role"
  | "companySize"
  | "useCase"
  | "budget"
  | "timeline"
  | "productInterest"
  | "buyingIntent"
  | "qualificationStatus"
  | "score"
  | "scoreBreakdown"
  | "scoreExplanation"
  | "createdAt"
  | "updatedAt"
>;

function toLeadDTO(row: LeadRow): LeadDTO {
  return {
    id: row.id,
    businessId: row.businessId,
    name: row.name,
    email: row.email,
    company: row.company,
    role: row.role,
    companySize: row.companySize,
    useCase: row.useCase,
    budget: row.budget,
    timeline: row.timeline,
    productInterest: row.productInterest,
    buyingIntent: row.buyingIntent,
    qualificationStatus: row.qualificationStatus,
    score: row.score,
    scoreBreakdown: toJsonObject(row.scoreBreakdown),
    scoreExplanation: row.scoreExplanation,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeLeadStatus(status: string): LeadStatus {
  return assertEnumValue(status, LEAD_STATUSES, "qualificationStatus");
}

function buildLeadConditions(
  businessId: string,
  status: LeadStatus | undefined,
) {
  const conditions = [eq(leads.businessId, businessId)];

  if (status) {
    conditions.push(eq(leads.qualificationStatus, status));
  }

  return conditions;
}

export async function getLeadByBusinessId(
  businessId: string,
  leadId: string,
): Promise<LeadDTO | null> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");
  const normalizedLeadId = assertUuid(leadId, "leadId");

  return withDataAccess("load lead", async () => {
    const [row] = await db
      .select(leadSelection)
      .from(leads)
      .where(
        and(
          eq(leads.businessId, normalizedBusinessId),
          eq(leads.id, normalizedLeadId),
        ),
      )
      .limit(1);

    return row ? toLeadDTO(row) : null;
  });
}

export async function listLeadsByBusinessId(
  businessId: string,
  options: LeadListOptions = {},
): Promise<LeadDTO[]> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");
  const normalizedStatus = options.status
    ? normalizeLeadStatus(options.status)
    : undefined;
  const limit = assertListLimit(options.limit);
  const offset = assertListOffset(options.offset);

  return withDataAccess("list leads", async () => {
    const rows = await db
      .select(leadSelection)
      .from(leads)
      .where(and(...buildLeadConditions(normalizedBusinessId, normalizedStatus)))
      .orderBy(desc(leads.createdAt), desc(leads.id))
      .limit(limit)
      .offset(offset);

    return rows.map(toLeadDTO);
  });
}

export async function createLead(
  businessId: string,
  input: CreateLeadInput,
): Promise<LeadDTO> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");
  const qualificationStatus = input.qualificationStatus
    ? normalizeLeadStatus(input.qualificationStatus)
    : "new";

  const values: InferInsertModel<typeof leads> = {
    businessId: normalizedBusinessId,
    name: input.name ?? null,
    email: input.email ?? null,
    company: input.company ?? null,
    role: input.role ?? null,
    companySize: input.companySize ?? null,
    useCase: input.useCase ?? null,
    budget: input.budget ?? null,
    timeline: input.timeline ?? null,
    productInterest: input.productInterest ?? null,
    buyingIntent: input.buyingIntent ?? null,
    qualificationStatus,
  };

  return withDataAccess("create lead", async () => {
    const [row] = await db
      .insert(leads)
      .values(values)
      .returning(leadSelection);

    if (!row) {
      throw new DataAccessError("DATABASE_ERROR", "The lead was not created.");
    }

    return toLeadDTO(row);
  });
}

export async function updateLead(
  businessId: string,
  leadId: string,
  input: UpdateLeadInput,
): Promise<LeadDTO> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");
  const normalizedLeadId = assertUuid(leadId, "leadId");
  const updates: Partial<InferInsertModel<typeof leads>> = {};

  if (input.name !== undefined) updates.name = input.name;
  if (input.email !== undefined) updates.email = input.email;
  if (input.company !== undefined) updates.company = input.company;
  if (input.role !== undefined) updates.role = input.role;
  if (input.companySize !== undefined) updates.companySize = input.companySize;
  if (input.useCase !== undefined) updates.useCase = input.useCase;
  if (input.budget !== undefined) updates.budget = input.budget;
  if (input.timeline !== undefined) updates.timeline = input.timeline;
  if (input.productInterest !== undefined) {
    updates.productInterest = input.productInterest;
  }
  if (input.buyingIntent !== undefined) {
    updates.buyingIntent = input.buyingIntent;
  }
  if (input.qualificationStatus !== undefined) {
    updates.qualificationStatus = normalizeLeadStatus(input.qualificationStatus);
  }

  if (Object.keys(updates).length === 0) {
    invalidInput("At least one lead field must be provided for update.");
  }

  updates.updatedAt = new Date();

  return withDataAccess("update lead", async () => {
    const [row] = await db
      .update(leads)
      .set(updates)
      .where(
        and(
          eq(leads.businessId, normalizedBusinessId),
          eq(leads.id, normalizedLeadId),
        ),
      )
      .returning(leadSelection);

    if (!row) {
      notFound("Lead");
    }

    return toLeadDTO(row);
  });
}

export async function countLeadsByBusinessId(
  businessId: string,
  status?: LeadStatus,
): Promise<number> {
  const normalizedBusinessId = assertUuid(businessId, "businessId");
  const normalizedStatus = status ? normalizeLeadStatus(status) : undefined;

  return withDataAccess("count leads", async () => {
    const [row] = await db
      .select({ count: count() })
      .from(leads)
      .where(and(...buildLeadConditions(normalizedBusinessId, normalizedStatus)));

    return Number(row?.count ?? 0);
  });
}
