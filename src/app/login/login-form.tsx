"use client";

import { useActionState } from "react";
import { useState } from "react";
import Link from "next/link";

import { signIn } from "@/app/auth/actions";
import { initialAuthActionState } from "@/lib/auth/action-state";

export function LoginForm({ redirectTo }: Readonly<{ redirectTo?: string }>) {
  const [state, formAction, pending] = useActionState(
    signIn,
    initialAuthActionState,
  );
  const emailError = state.fieldErrors?.email;
  const passwordError = state.fieldErrors?.password;
  const [showPassword, setShowPassword] = useState(false);

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
          maxLength={254}
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

      <div className="auth-field">
        <label htmlFor="login-password">Password</label>
        <div className="auth-password-control">
        <input
          aria-describedby={passwordError ? "login-password-error" : undefined}
          aria-invalid={Boolean(passwordError)}
          autoComplete="current-password"
          id="login-password"
          maxLength={72}
          name="password"
          required
          type={showPassword ? "text" : "password"}
        />
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="auth-password-toggle"
            onClick={() => setShowPassword((visible) => !visible)}
            type="button"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        {passwordError ? (
          <small className="auth-field-error" id="login-password-error">
            {passwordError}
          </small>
        ) : null}
      </div>

      <Link className="auth-recovery-link" href="/forgot-password">
        Forgot password?
      </Link>

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
