"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createKnowledgeDocumentAction } from "../actions";
import { initialDashboardActionState } from "../action-state";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="button button-primary" disabled={pending} type="submit">
      {pending ? "Processing…" : "Create and ingest"}
    </button>
  );
}

export function KnowledgeCreateForm({
  businessId,
}: Readonly<{ businessId: string }>) {
  const [state, formAction] = useActionState(
    createKnowledgeDocumentAction,
    initialDashboardActionState,
  );

  return (
    <form action={formAction} className="knowledge-form">
      <input name="businessId" type="hidden" value={businessId} />
      <label>
        <span>Document name</span>
        <input name="name" placeholder="Product overview" required />
      </label>
      <label>
        <span>Document type</span>
        <select defaultValue="text" name="documentType">
          <option value="text">Plain text</option>
        </select>
      </label>
      <label className="knowledge-form-wide">
        <span>Content</span>
        <textarea
          name="content"
          placeholder="Paste approved product, pricing, or policy content."
          required
          rows={10}
        />
      </label>
      <div className="knowledge-form-footer">
        <p>
          Content is normalized, chunked, embedded, and stored for tenant-scoped
          retrieval. Plain text only.
        </p>
        <SubmitButton />
      </div>
      {state.error ? (
        <p aria-live="polite" className="form-feedback error">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
