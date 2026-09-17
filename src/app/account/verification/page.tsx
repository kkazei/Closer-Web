import Link from "next/link";
import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export default async function VerificationPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login?next=/account/verification");
  }

  const verified = Boolean(user.profile?.emailVerifiedAt);

  return (
    <main className="auth-page">
      <section className="auth-card account-status-card">
        <div className="auth-heading">
          <p className="auth-kicker">Closer / Account status</p>
          <h1>Email verification</h1>
          <p>
            {verified
              ? "Your email is verified."
              : "Email verification is still pending."}
          </p>
        </div>

        {!verified ? (
          <div className="auth-notice">
            <strong>No email was sent in this demo.</strong>
            <p>
              The account stores verification state and is ready for a future
              verification endpoint. You can continue using the workspace
              without verifying your email.
            </p>
          </div>
        ) : null}

        <dl className="account-status-details">
          <div>
            <dt>Email</dt>
            <dd>{user.email ?? "Not available"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{verified ? "Verified" : "Email not verified"}</dd>
          </div>
        </dl>

        <Link className="button button-primary" href="/dashboard">
          Back to dashboard
        </Link>
      </section>
    </main>
  );
}
