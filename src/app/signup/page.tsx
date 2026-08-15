import Link from "next/link";

import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <section className="w-full max-w-md space-y-6 rounded-xl border border-foreground/10 p-8">
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground/50">Closer</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Create account
          </h1>
          <p className="text-sm text-foreground/60">
            This creates a Supabase Auth user and matching Closer profile.
          </p>
        </div>

        <SignupForm />

        <p className="text-center text-sm text-foreground/60">
          Already have an account?{" "}
          <Link className="underline underline-offset-4" href="/login">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
