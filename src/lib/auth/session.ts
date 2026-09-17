import "server-only";

import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";

export const AUTH_COOKIE_NAME = "closer_session";
export const AUTH_SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const JWT_ISSUER = "closer";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AuthTokenPayload = Readonly<{
  userId: string;
  email?: string;
}>;

function getSigningKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET must be configured with at least 32 characters.",
    );
  }

  return new TextEncoder().encode(secret);
}

export async function createToken(input: AuthTokenPayload): Promise<string> {
  if (!UUID_PATTERN.test(input.userId)) {
    throw new Error("Cannot create a session for an invalid user ID.");
  }

  const payload = input.email ? { email: input.email } : {};

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(JWT_ISSUER)
    .setSubject(input.userId)
    .setIssuedAt()
    .setExpirationTime(`${AUTH_SESSION_MAX_AGE}s`)
    .sign(getSigningKey());
}

export async function verifyToken(
  token: string | undefined,
): Promise<AuthTokenPayload | null> {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSigningKey(), {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
    });

    if (!payload.sub || !UUID_PATTERN.test(payload.sub)) {
      return null;
    }

    return {
      userId: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
    };
  } catch {
    return null;
  }
}

export async function getSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIE_NAME)?.value;
}

export async function getTokenFromCookies(): Promise<AuthTokenPayload | null> {
  return verifyToken(await getSessionToken());
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: AUTH_SESSION_MAX_AGE,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(0),
    maxAge: 0,
    path: "/",
  });
}
