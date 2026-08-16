import { randomUUID } from "node:crypto";

import { type NextResponse } from "next/server";

export const ANONYMOUS_VISITOR_COOKIE_NAME = "closer_visitor_id";
export const ANONYMOUS_VISITOR_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isVisitorUuid(value: string | undefined): value is string {
  return value !== undefined && UUID_PATTERN.test(value);
}

export function readAnonymousVisitorId(
  request: Request,
): string | undefined {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return undefined;
  }

  for (const cookie of cookieHeader.split(";")) {
    const separatorIndex = cookie.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    if (
      cookie.slice(0, separatorIndex).trim() ===
      ANONYMOUS_VISITOR_COOKIE_NAME
    ) {
      return cookie.slice(separatorIndex + 1).trim();
    }
  }

  return undefined;
}

export function getOrCreateAnonymousVisitorId(request: Request): string {
  const existingVisitorId = readAnonymousVisitorId(request);

  return isVisitorUuid(existingVisitorId) ? existingVisitorId : randomUUID();
}

export function setAnonymousVisitorCookie(
  response: NextResponse,
  visitorId: string,
): NextResponse {
  response.cookies.set({
    name: ANONYMOUS_VISITOR_COOKIE_NAME,
    value: visitorId,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: ANONYMOUS_VISITOR_COOKIE_MAX_AGE_SECONDS,
  });

  return response;
}
