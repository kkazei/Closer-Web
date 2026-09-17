"use server";

import "server-only";

import { compare, hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createAuthAccount, getAuthAccountByEmail } from "@/data";
import type { AuthActionState } from "@/lib/auth/action-state";
import { clearSessionCookie, createToken, setSessionCookie } from "@/lib/auth/session";

function readText(formData: FormData, fieldName: string): string {
  const value = formData.get(fieldName);
  return typeof value === "string" ? value : "";
}

function readSafeRedirect(formData: FormData): string {
  const destination = readText(formData, "next");

  return destination.startsWith("/") && !destination.startsWith("//")
    ? destination
    : "/dashboard";
}

function invalidCredentials(): AuthActionState {
  return {
    error: "Invalid email or password.",
    message: null,
  };
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(
    z.email({ error: "Enter a valid email address." }),
  ),
  password: z.string().min(1, { error: "Enter your password." }),
});

const signupSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .max(100, { error: "Name must be 100 characters or fewer." }),
    email: z.string().trim().toLowerCase().max(254).pipe(
      z.email({ error: "Enter a valid email address." }),
    ),
    password: z
      .string()
      .min(8, { error: "Use at least 8 characters." })
      .max(72, { error: "Use 72 characters or fewer." })
      .regex(/[A-Za-z]/, { error: "Include at least one letter." })
      .regex(/[0-9]/, { error: "Include at least one number." }),
    passwordConfirmation: z.string().min(1, { error: "Confirm your password." }),
  })
  .refine((values) => values.password === values.passwordConfirmation, {
    path: ["passwordConfirmation"],
    error: "Passwords do not match.",
  });

function validationState(error: z.ZodError): AuthActionState {
  const fieldErrors: AuthActionState["fieldErrors"] = {};

  for (const issue of error.issues) {
    const field = issue.path[0];

    if (
      (field === "email" ||
        field === "password" ||
        field === "passwordConfirmation" ||
        field === "fullName") &&
      !fieldErrors[field]
    ) {
      fieldErrors[field] = issue.message;
    }
  }

  return {
    error: "Check the highlighted fields and try again.",
    message: null,
    fieldErrors,
  };
}

function accountCreationError(): AuthActionState {
  return {
    error: "Unable to create the account. Check the details or try signing in.",
    message: null,
  };
}

export async function signUp(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signupSchema.safeParse({
    fullName: readText(formData, "fullName"),
    email: readText(formData, "email"),
    password: readText(formData, "password"),
    passwordConfirmation: readText(formData, "passwordConfirmation"),
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const { email, password, fullName } = parsed.data;

  try {
    const existingAccount = await getAuthAccountByEmail(email);

    if (existingAccount) {
      return accountCreationError();
    }

    const passwordHash = await hash(password, 12);
    const account = await createAuthAccount({
      email,
      passwordHash,
      fullName: fullName || null,
    });
    const token = await createToken({ userId: account.id, email: account.email });

    await setSessionCookie(token);
  } catch {
    return accountCreationError();
  }

  revalidatePath("/", "layout");
  redirect("/dashboard?welcome=1");
}

export async function signIn(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: readText(formData, "email"),
    password: readText(formData, "password"),
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const { email, password } = parsed.data;

  try {
    const account = await getAuthAccountByEmail(email);

    if (!account || !(await compare(password, account.passwordHash))) {
      return invalidCredentials();
    }

    const token = await createToken({ userId: account.id, email: account.email });
    await setSessionCookie(token);
  } catch {
    return invalidCredentials();
  }

  revalidatePath("/", "layout");
  redirect(readSafeRedirect(formData));
}

export async function signOut(_formData: FormData): Promise<void> {
  void _formData;
  await clearSessionCookie();

  revalidatePath("/", "layout");
  redirect("/login");
}
