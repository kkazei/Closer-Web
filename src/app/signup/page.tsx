import Link from "next/link";

import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-heading">
          <p className="auth-kicker">Closer / Workspace</p>
          <h1>Create account</h1>
          <p>
            Create a workspace account. Email verification is optional for this
            portfolio demo.
          </p>
        </div>

        <SignupForm />

        <p className="auth-switch">
          Already have an account?{" "}
          <Link className="underline underline-offset-4" href="/login">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
