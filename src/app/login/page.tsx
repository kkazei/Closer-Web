import Link from "next/link";

import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <section className="w-full max-w-md space-y-6 rounded-xl border border-foreground/10 p-8">
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground/50">Closer</p>
          <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-foreground/60">
            Use your development Supabase Auth account.
          </p>
        </div>

        <LoginForm />

        <p className="text-center text-sm text-foreground/60">
          Need an account?{" "}
          <Link className="underline underline-offset-4" href="/signup">
            Create one
          </Link>
        </p>
      </section>
    </main>
  );
}
