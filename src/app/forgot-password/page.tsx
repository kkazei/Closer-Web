import Link from "next/link";

import { AuthFrame } from "@/app/_components/auth-frame";
import { ForgotPasswordForm } from "./forgot-password-form";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <AuthFrame
      description="Account recovery belongs in a trustworthy sign-in flow. We’ll enable email reset links once a mail provider is configured."
      headline="We’ll help you get back in."
    >
      <div className="auth-heading">
        <p className="auth-kicker">Account access</p>
        <h1>Reset password</h1>
        <p>Enter the email you use for Closer.</p>
      </div>
      <p className="auth-recovery-notice">
        Email recovery is not configured yet. Submitting this form will not send
        an email or change your password.
      </p>
      <ForgotPasswordForm />
      <Link className="auth-back-link" href="/login">
        <span aria-hidden="true">←</span> Back to sign in
      </Link>
    </AuthFrame>
  );
}
