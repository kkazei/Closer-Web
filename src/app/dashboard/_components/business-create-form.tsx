"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createBusinessAction } from "../actions";
import { initialDashboardActionState } from "../action-state";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="button button-primary" disabled={pending} type="submit">
      {pending ? "Creating workspace…" : "Create business workspace"}
    </button>
  );
}

export function BusinessCreateForm() {
  const [state, formAction] = useActionState(
    createBusinessAction,
    initialDashboardActionState,
  );

  return (
    <form action={formAction} className="business-create-form">
      <label>
        <span>Business name</span>
        <input
          autoComplete="organization"
          maxLength={100}
          name="businessName"
          placeholder="Acme Studio"
          required
        />
      </label>
      <SubmitButton />
      {state.error ? (
        <p aria-live="polite" className="form-feedback error">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
