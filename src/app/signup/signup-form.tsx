"use client";

import { useActionState, useState, type FormEvent } from "react";

import { signUp } from "@/app/auth/actions";
import { initialAuthActionState } from "@/lib/auth/action-state";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(
    signUp,
    initialAuthActionState,
  );
  const errors = state.fieldErrors;
  const [showPasswords, setShowPasswords] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const requirements = [
    { label: "8+ characters", valid: password.length >= 8 },
    { label: "A letter", valid: /[A-Za-z]/.test(password) },
    { label: "A number", valid: /[0-9]/.test(password) },
    { label: "Up to 72", valid: password.length <= 72 },
  ];
  const confirmationError =
    errors?.passwordConfirmation ??
    (passwordConfirmation && password !== passwordConfirmation
      ? "Passwords do not match."
      : undefined);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (password !== passwordConfirmation) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} className="auth-form" onSubmit={handleSubmit}>
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
          maxLength={254}
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

      <div className="auth-field">
        <label htmlFor="signup-password">Password</label>
        <div className="auth-password-control">
        <input
          aria-describedby={
            errors?.password
              ? "signup-password-note signup-password-checks signup-password-error"
              : "signup-password-note signup-password-checks"
          }
          aria-invalid={Boolean(
            errors?.password || (password.length > 0 && !requirements.every(({ valid }) => valid)),
          )}
          autoComplete="new-password"
          id="signup-password"
          minLength={8}
          maxLength={72}
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type={showPasswords ? "text" : "password"}
        />
          <button
            aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
            aria-pressed={showPasswords}
            className="auth-password-toggle"
            onClick={() => setShowPasswords((visible) => !visible)}
            type="button"
          >
            {showPasswords ? "Hide" : "Show"}
          </button>
        </div>
        <small id="signup-password-note">Choose a password for your account.</small>
        <div className="auth-password-checks" id="signup-password-checks" aria-label="Password requirements">
          {requirements.map(({ label, valid }) => (
            <span className={valid ? "auth-password-check valid" : "auth-password-check"} key={label}>
              {valid ? "✓ " : "· "}{label}
            </span>
          ))}
        </div>
        {errors?.password ? (
          <small className="auth-field-error" id="signup-password-error">
            {errors.password}
          </small>
        ) : null}
      </div>

      <div className="auth-field">
        <label htmlFor="signup-password-confirmation">Confirm password</label>
        <div className="auth-password-control">
        <input
          aria-describedby={
            confirmationError
              ? "signup-confirmation-error"
              : undefined
          }
          aria-invalid={Boolean(confirmationError)}
          autoComplete="new-password"
          id="signup-password-confirmation"
          name="passwordConfirmation"
          onChange={(event) => setPasswordConfirmation(event.target.value)}
          required
          type={showPasswords ? "text" : "password"}
        />
          <button
            aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
            aria-pressed={showPasswords}
            className="auth-password-toggle"
            onClick={() => setShowPasswords((visible) => !visible)}
            type="button"
          >
            {showPasswords ? "Hide" : "Show"}
          </button>
        </div>
        {confirmationError ? (
          <small className="auth-field-error" id="signup-confirmation-error">
            {confirmationError}
          </small>
        ) : null}
      </div>

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
