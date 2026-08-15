"use client";

import { useActionState } from "react";

import { signIn } from "@/app/auth/actions";
import { initialAuthActionState } from "@/lib/auth/action-state";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    signIn,
    initialAuthActionState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <label className="block space-y-2 text-sm">
        <span className="font-medium">Email</span>
        <input
          autoComplete="email"
          className="w-full rounded-md border border-foreground/20 bg-transparent px-3 py-2"
          name="email"
          required
          type="email"
        />
      </label>

      <label className="block space-y-2 text-sm">
        <span className="font-medium">Password</span>
        <input
          autoComplete="current-password"
          className="w-full rounded-md border border-foreground/20 bg-transparent px-3 py-2"
          minLength={8}
          name="password"
          required
          type="password"
        />
      </label>

      {state.error ? (
        <p aria-live="polite" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      {state.message ? (
        <p aria-live="polite" className="text-sm text-green-600">
          {state.message}
        </p>
      ) : null}

      <button
        className="w-full rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
