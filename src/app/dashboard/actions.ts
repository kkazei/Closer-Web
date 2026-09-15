"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  archiveKnowledgeDocument,
  createKnowledgeDocument,
  getMembership,
} from "@/data";
import { ingestKnowledgeDocument } from "@/rag/ingestion";
import { withAuthenticatedDb } from "@/db";
import { getCurrentAuthenticatedUser } from "@/lib/auth/context";

export type DashboardActionState = Readonly<{
  error: string | null;
  message: string | null;
}>;

export const initialDashboardActionState: DashboardActionState = {
  error: null,
  message: null,
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_DOCUMENT_NAME_LENGTH = 200;
const MAX_DOCUMENT_CHARACTERS = 100_000;

function readText(formData: FormData, fieldName: string): string {
  const value = formData.get(fieldName);
  return typeof value === "string" ? value.trim() : "";
}

function actionError(message: string): DashboardActionState {
  return { error: message, message: null };
}

function isManager(role: string): boolean {
  return role === "owner" || role === "admin";
}

export async function createKnowledgeDocumentAction(
  _previousState: DashboardActionState,
  formData: FormData,
): Promise<DashboardActionState> {
  const businessId = readText(formData, "businessId");
  const name = readText(formData, "name");
  const documentType = readText(formData, "documentType");
  const content = readText(formData, "content");

  if (!UUID_PATTERN.test(businessId)) {
    return actionError("Select a valid business workspace.");
  }

  if (name.length === 0 || name.length > MAX_DOCUMENT_NAME_LENGTH) {
    return actionError("Enter a document name under 200 characters.");
  }

  if (documentType !== "text") {
    return actionError("Only plain text documents are supported right now.");
  }

  if (content.length === 0 || content.length > MAX_DOCUMENT_CHARACTERS) {
    return actionError(
      "Enter document content under 100,000 characters.",
    );
  }

  const user = await getCurrentAuthenticatedUser();

  if (!user) {
    return actionError("Your session has expired. Sign in again.");
  }

  let documentId: string;

  try {
    const document = await withAuthenticatedDb(
      { userId: user.userId },
      async () => {
        const membership = await getMembership(businessId, user.userId);

        if (!membership || !isManager(membership.role)) {
          throw new Error("FORBIDDEN");
        }

        return createKnowledgeDocument(businessId, {
          createdByProfileId: user.userId,
          name,
          documentType,
        });
      },
    );
    documentId = document.id;
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return actionError("Only owners and admins can add knowledge.");
    }

    return actionError("The knowledge document could not be created.");
  }

  try {
    await ingestKnowledgeDocument({
      authenticatedUserId: user.userId,
      businessId,
      documentId,
      content,
    });
  } catch {
    revalidatePath("/dashboard/knowledge");
    return actionError(
      "The document was created, but ingestion failed. Review its status before trying again.",
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/knowledge");
  redirect(`/dashboard/knowledge?business=${encodeURIComponent(businessId)}`);
}

export async function archiveKnowledgeDocumentAction(
  formData: FormData,
): Promise<void> {
  const businessId = readText(formData, "businessId");
  const documentId = readText(formData, "documentId");
  const user = await getCurrentAuthenticatedUser();

  if (!user || !UUID_PATTERN.test(businessId) || !UUID_PATTERN.test(documentId)) {
    return;
  }

  try {
    await withAuthenticatedDb({ userId: user.userId }, async () => {
      const membership = await getMembership(businessId, user.userId);

      if (!membership || !isManager(membership.role)) {
        throw new Error("FORBIDDEN");
      }

      await archiveKnowledgeDocument(businessId, documentId);
    });
  } catch {
    return;
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/knowledge");
  redirect(`/dashboard/knowledge?business=${encodeURIComponent(businessId)}`);
}
