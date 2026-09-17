"use client";

import { useActionState } from "react";

import { signIn } from "@/app/auth/actions";
import { initialAuthActionState } from "@/lib/auth/action-state";

export function LoginForm({ redirectTo }: Readonly<{ redirectTo?: string }>) {
  const [state, formAction, pending] = useActionState(
    signIn,
    initialAuthActionState,
  );
  const emailError = state.fieldErrors?.email;
  const passwordError = state.fieldErrors?.password;

  return (
    <form action={formAction} className="auth-form">
      {redirectTo ? <input name="next" type="hidden" value={redirectTo} /> : null}
      <label className="auth-field" htmlFor="login-email">
        <span>Email</span>
        <input
          aria-describedby={emailError ? "login-email-error" : undefined}
          aria-invalid={Boolean(emailError)}
          autoComplete="email"
          id="login-email"
          name="email"
          required
          type="email"
        />
        {emailError ? (
          <small className="auth-field-error" id="login-email-error">
            {emailError}
          </small>
        ) : null}
      </label>

      <label className="auth-field" htmlFor="login-password">
        <span>Password</span>
        <input
          aria-describedby={passwordError ? "login-password-error" : undefined}
          aria-invalid={Boolean(passwordError)}
          autoComplete="current-password"
          id="login-password"
          name="password"
          required
          type="password"
        />
        {passwordError ? (
          <small className="auth-field-error" id="login-password-error">
            {passwordError}
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
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
