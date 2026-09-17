import Link from "next/link";

import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-heading">
          <p className="auth-kicker">Closer / Workspace</p>
          <h1>Sign in</h1>
          <p>Use your Closer account to access the protected workspace.</p>
        </div>

        <LoginForm redirectTo={next} />

        <p className="auth-switch">
          Need an account?{" "}
          <Link className="underline underline-offset-4" href="/signup">
            Create one
          </Link>
        </p>
      </section>
    </main>
  );
}
