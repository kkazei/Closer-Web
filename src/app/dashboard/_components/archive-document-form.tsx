"use client";

import { useFormStatus } from "react-dom";

import { archiveKnowledgeDocumentAction } from "../actions";

function ArchiveSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="button button-quiet" disabled={pending} type="submit">
      {pending ? "Archiving…" : "Archive"}
    </button>
  );
}

export function ArchiveDocumentForm({
  businessId,
  documentId,
}: Readonly<{ businessId: string; documentId: string }>) {
  return (
    <form action={archiveKnowledgeDocumentAction}>
      <input name="businessId" type="hidden" value={businessId} />
      <input name="documentId" type="hidden" value={documentId} />
      <ArchiveSubmitButton />
    </form>
  );
}
