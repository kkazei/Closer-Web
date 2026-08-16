import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { createAnonymousChatSession } from "@/data/public-chat";
import {
  consumeAnonymousSessionRateLimit,
  consumeMalformedRequestRateLimit,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VISITOR_COOKIE_NAME = "closer_visitor_id";
const VISITOR_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const MAX_REQUEST_BYTES = 4 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUSINESS_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type PublicSessionBody = Readonly<{
  businessSlug: string;
}>;

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function errorResponse(
  status: 400 | 404 | 429 | 500,
  message: string,
  retryAfterSeconds?: number,
): NextResponse {
  const response = NextResponse.json({ error: message }, { status });

  if (retryAfterSeconds !== undefined) {
    response.headers.set("Retry-After", String(retryAfterSeconds));
  }

  return noStore(response);
}

function getRequestFingerprint(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0];
  const realIp = request.headers.get("x-real-ip");
  const candidate = (forwarded ?? realIp ?? "unknown").trim();

  return candidate.length > 0 && candidate.length <= 128 ? candidate : "unknown";
}

function getCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return undefined;
  }

  for (const cookie of cookieHeader.split(";")) {
    const separatorIndex = cookie.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    const cookieName = cookie.slice(0, separatorIndex).trim();

    if (cookieName === name) {
      return cookie.slice(separatorIndex + 1).trim();
    }
  }

  return undefined;
}

function isUuid(value: string | undefined): value is string {
  return value !== undefined && UUID_PATTERN.test(value);
}

function normalizeBusinessSlug(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const slug = value.trim().toLowerCase();

  if (
    slug.length < 1 ||
    slug.length > 100 ||
    !BUSINESS_SLUG_PATTERN.test(slug)
  ) {
    return null;
  }

  return slug;
}

async function parseBody(
  request: Request,
): Promise<PublicSessionBody | null> {
  const contentType = request.headers.get("content-type");
  const mediaType = contentType?.split(";", 1)[0].trim().toLowerCase();

  if (mediaType !== "application/json") {
    return null;
  }

  const contentLength = request.headers.get("content-length");

  if (
    contentLength !== null &&
    Number.isFinite(Number(contentLength)) &&
    Number(contentLength) > MAX_REQUEST_BYTES
  ) {
    return null;
  }

  let text: string;

  try {
    text = await request.text();
  } catch {
    return null;
  }

  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    return null;
  }

  const keys = Object.keys(parsed);

  // Keep the public contract deliberately narrow. In particular, businessId
  // and visitorId must never become client-controlled authorization inputs.
  if (keys.length !== 1 || keys[0] !== "businessSlug") {
    return null;
  }

  const businessSlug = normalizeBusinessSlug(
    (parsed as Record<string, unknown>).businessSlug,
  );

  return businessSlug ? { businessSlug } : null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestFingerprint = getRequestFingerprint(request);
  const body = await parseBody(request);

  if (!body) {
    const limit = consumeMalformedRequestRateLimit(requestFingerprint);

    if (!limit.allowed) {
      return errorResponse(429, "Too many requests.", limit.retryAfterSeconds);
    }

    return errorResponse(400, "Invalid request.");
  }

  const suppliedVisitorId = getCookie(request, VISITOR_COOKIE_NAME);
  const validCookieVisitorId = isUuid(suppliedVisitorId)
    ? suppliedVisitorId
    : undefined;
  const visitorId = validCookieVisitorId ?? randomUUID();
  const rateLimitIdentity = validCookieVisitorId ?? "no-cookie";
  const limit = consumeAnonymousSessionRateLimit(
    `${requestFingerprint}:${rateLimitIdentity}:${body.businessSlug}`,
  );

  if (!limit.allowed) {
    return errorResponse(429, "Too many requests.", limit.retryAfterSeconds);
  }

  try {
    const session = await createAnonymousChatSession({
      businessSlug: body.businessSlug,
      visitorId,
    });

    if (!session) {
      return errorResponse(404, "Business not found.");
    }

    const response = noStore(
      NextResponse.json(
        {
          sessionId: session.sessionId,
          expiresAt: session.expiresAt,
        },
        { status: 201 },
      ),
    );

    response.cookies.set({
      name: VISITOR_COOKIE_NAME,
      value: visitorId,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
    });

    return response;
  } catch {
    return errorResponse(500, "Unable to create chat session.");
  }
}
