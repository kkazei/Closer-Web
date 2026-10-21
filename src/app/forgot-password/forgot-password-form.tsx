"use client";

import { useState, type FormEvent } from "react";

export function ForgotPasswordForm() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <form className="auth-recovery-form" onSubmit={handleSubmit}>
      <label className="auth-field" htmlFor="recovery-email">
        <span>Email address</span>
        <input
          autoComplete="email"
          id="recovery-email"
          maxLength={254}
          name="email"
          required
          type="email"
        />
      </label>
      <button className="button button-primary auth-submit" type="submit">
        Check recovery options
      </button>
      {submitted ? (
        <p className="auth-recovery-result" role="status">
          No reset email was sent because email delivery is not set up yet. Use
          your current password to sign in, or contact the project owner if you
          need help accessing this demo.
        </p>
      ) : null}
    </form>
  );
}
