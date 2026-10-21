import Link from "next/link";

import { AuthFrame } from "@/app/_components/auth-frame";
import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <AuthFrame
      description="Set up a workspace, add the information your assistant should know, and review conversations from your visitors."
      headline="Give your business a better first response."
    >
      <div className="auth-heading">
        <p className="auth-kicker">Start with Closer</p>
        <h1>Create account</h1>
        <p>Email verification is optional in this portfolio demo.</p>
      </div>

      <SignupForm />

      <p className="auth-switch">
        Already have an account?{" "}
        <Link href="/login">Sign in</Link>
      </p>
    </AuthFrame>
  );
}
