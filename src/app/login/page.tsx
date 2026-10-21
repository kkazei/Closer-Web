import Link from "next/link";

import { AuthFrame } from "@/app/_components/auth-frame";
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
    <AuthFrame
      description="Bring your business knowledge, visitor conversations, and next steps into one focused workspace."
      headline="Make every conversation count."
    >
      <div className="auth-heading">
        <p className="auth-kicker">Welcome back</p>
        <h1>Sign in</h1>
        <p>Use your Closer account to open your business workspace.</p>
      </div>

      <LoginForm redirectTo={next} />

      <p className="auth-switch">
        New to Closer?{" "}
        <Link href="/signup">Create an account</Link>
      </p>
    </AuthFrame>
  );
}
