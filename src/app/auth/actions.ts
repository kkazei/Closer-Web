"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ensureProfileForAuthUser } from "@/data";
import { createClient } from "@/lib/supabase/server";
import type { AuthActionState } from "@/lib/auth/action-state";

function readText(formData: FormData, fieldName: string): string {
  const value = formData.get(fieldName);
  return typeof value === "string" ? value : "";
}

function readEmail(formData: FormData): string {
  return readText(formData, "email").trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return email.length > 3 && email.length <= 254 && email.includes("@");
}

function invalidCredentials(): AuthActionState {
  return {
    error: "Invalid email or password.",
    message: null,
  };
}

export async function signUp(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = readEmail(formData);
  const password = readText(formData, "password");
  const fullName = readText(formData, "fullName").trim();

  if (!isValidEmail(email) || password.length < 8) {
    return {
      error: "Enter a valid email and a password with at least 8 characters.",
      message: null,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: fullName ? { full_name: fullName } : undefined,
    },
  });

  if (error || !data.user) {
    return {
      error: "Unable to create the account. Check the details or try signing in.",
      message: null,
    };
  }

  try {
    await ensureProfileForAuthUser(data.user.id, {
      fullName: fullName || null,
    });
  } catch {
    return {
      error: "The account was created, but profile setup could not be completed.",
      message: null,
    };
  }

  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/dashboard");
  }

  return {
    error: null,
    message: "Account created. Check your email if confirmation is required, then sign in.",
  };
}

export async function signIn(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = readEmail(formData);
  const password = readText(formData, "password");

  if (!isValidEmail(email) || password.length === 0) {
    return invalidCredentials();
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return invalidCredentials();
  }

  try {
    await ensureProfileForAuthUser(data.user.id);
  } catch {
    return {
      error: "Signed in, but profile setup could not be completed.",
      message: null,
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOut(_formData: FormData): Promise<void> {
  void _formData;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims) {
    await supabase.auth.signOut();
  }

  revalidatePath("/", "layout");
  redirect("/login");
}
