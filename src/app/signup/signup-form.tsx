"use client";

import { useActionState } from "react";

import { signUp } from "@/app/auth/actions";
import { initialAuthActionState } from "@/lib/auth/action-state";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(
    signUp,
    initialAuthActionState,
  );
  const errors = state.fieldErrors;

  return (
    <form action={formAction} className="auth-form">
      <label className="auth-field" htmlFor="signup-name">
        <span>Name <em>optional</em></span>
        <input
          aria-describedby={errors?.fullName ? "signup-name-error" : undefined}
          aria-invalid={Boolean(errors?.fullName)}
          autoComplete="name"
          id="signup-name"
          name="fullName"
          type="text"
        />
        {errors?.fullName ? (
          <small className="auth-field-error" id="signup-name-error">
            {errors.fullName}
          </small>
        ) : null}
      </label>

      <label className="auth-field" htmlFor="signup-email">
        <span>Email</span>
        <input
          aria-describedby={errors?.email ? "signup-email-error" : undefined}
          aria-invalid={Boolean(errors?.email)}
          autoComplete="email"
          id="signup-email"
          name="email"
          required
          type="email"
        />
        {errors?.email ? (
          <small className="auth-field-error" id="signup-email-error">
            {errors.email}
          </small>
        ) : null}
      </label>

      <label className="auth-field" htmlFor="signup-password">
        <span>Password</span>
        <input
          aria-describedby={
            errors?.password
              ? "signup-password-note signup-password-error"
              : "signup-password-note"
          }
          aria-invalid={Boolean(errors?.password)}
          autoComplete="new-password"
          id="signup-password"
          minLength={8}
          name="password"
          required
          type="password"
        />
        <small id="signup-password-note">
          At least 8 characters, including a letter and a number.
        </small>
        {errors?.password ? (
          <small className="auth-field-error" id="signup-password-error">
            {errors.password}
          </small>
        ) : null}
      </label>

      <label className="auth-field" htmlFor="signup-password-confirmation">
        <span>Confirm password</span>
        <input
          aria-describedby={
            errors?.passwordConfirmation
              ? "signup-confirmation-error"
              : undefined
          }
          aria-invalid={Boolean(errors?.passwordConfirmation)}
          autoComplete="new-password"
          id="signup-password-confirmation"
          name="passwordConfirmation"
          required
          type="password"
        />
        {errors?.passwordConfirmation ? (
          <small className="auth-field-error" id="signup-confirmation-error">
            {errors.passwordConfirmation}
          </small>
        ) : null}
      </label>

      {state.error ? (
        <p aria-live="polite" className="auth-feedback auth-feedback-error">
          {state.error}
        </p>
      ) : null}

      {state.message ? (
        <p aria-live="polite" className="auth-feedback auth-feedback-success">
          {state.message}
        </p>
      ) : null}

      <button className="button button-primary auth-submit" disabled={pending} type="submit">
        {pending ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}
