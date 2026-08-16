import { NextRequest, NextResponse } from "next/server";
import { streamText } from "ai";

import {
  GROQ_DEFAULT_MODEL,
  GROQ_PROVIDER_NAME,
  getGroqChatModel,
} from "@/ai";
import {
  getAnonymousConversationContext,
  insertAnonymousSessionMessage,
} from "@/data/public-chat";
import {
  consumeAnonymousMessageRateLimit,
  consumeMalformedRequestRateLimit,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VISITOR_COOKIE_NAME = "closer_visitor_id";
const MAX_REQUEST_BYTES = 8 * 1024;
const MAX_MESSAGE_CHARS = 2_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUSINESS_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type ChatBody = Readonly<{
  businessSlug: string;
  sessionId: string;
  message: string;
}>;

function noStore<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function errorResponse(
  status: 400 | 401 | 404 | 429 | 500,
  message: string,
  retryAfterSeconds?: number,
): NextResponse {
  const response = NextResponse.json({ error: message }, { status });

  if (retryAfterSeconds !== undefined) {
    response.headers.set("Retry-After", String(retryAfterSeconds));
  }

  return noStore(response);
}

function getRequestFingerprint(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0];
  const realIp = request.headers.get("x-real-ip");
  const candidate = (forwarded ?? realIp ?? "unknown").trim();

  return candidate.length > 0 && candidate.length <= 128 ? candidate : "unknown";
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

function normalizeSessionId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const sessionId = value.trim();
  return UUID_PATTERN.test(sessionId) ? sessionId : null;
}

function normalizeMessage(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const message = value.trim();

  if (message.length < 1 || message.length > MAX_MESSAGE_CHARS) {
    return null;
  }

  return message;
}

async function parseBody(request: NextRequest): Promise<ChatBody | null> {
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

  if (
    keys.length !== 3 ||
    !keys.includes("businessSlug") ||
    !keys.includes("sessionId") ||
    !keys.includes("message")
  ) {
    return null;
  }

  const businessSlug = normalizeBusinessSlug(
    (parsed as Record<string, unknown>).businessSlug,
  );
  const sessionId = normalizeSessionId(
    (parsed as Record<string, unknown>).sessionId,
  );
  const message = normalizeMessage((parsed as Record<string, unknown>).message);

  if (!businessSlug || !sessionId || !message) {
    return null;
  }

  return {
    businessSlug,
    sessionId,
    message,
  };
}

function buildSystemPrompt(businessName: string): string {
  return [
    `You are Closer, the AI sales assistant for ${businessName}.`,
    "Your goal is to help website visitors understand the offer, answer product questions truthfully, and keep the conversation natural.",
    "If a user asks about details that are not provided, say you do not know instead of inventing facts.",
    "Keep responses concise, clear, and helpful. Use plain text.",
  ].join(" ");
}

export async function POST(request: NextRequest): Promise<Response> {
  const requestFingerprint = getRequestFingerprint(request);
  const body = await parseBody(request);

  if (!body) {
    const limit = consumeMalformedRequestRateLimit(requestFingerprint);

    if (!limit.allowed) {
      return errorResponse(429, "Too many requests.", limit.retryAfterSeconds);
    }

    return errorResponse(400, "Invalid request.");
  }

  const visitorId = request.cookies.get(VISITOR_COOKIE_NAME)?.value;

  if (!visitorId || !UUID_PATTERN.test(visitorId)) {
    return errorResponse(401, "Chat session is unavailable.");
  }

  const messageLimit = consumeAnonymousMessageRateLimit(
    `${requestFingerprint}:${visitorId}:${body.sessionId}`,
  );

  if (!messageLimit.allowed) {
    return errorResponse(429, "Too many requests.", messageLimit.retryAfterSeconds);
  }

  try {
    const conversation = await getAnonymousConversationContext({
      businessSlug: body.businessSlug,
      sessionId: body.sessionId,
      visitorId,
    });

    if (!conversation) {
      return errorResponse(404, "Chat session not found.");
    }

    await insertAnonymousSessionMessage({
      businessId: conversation.businessId,
      sessionId: conversation.sessionId,
      role: "user",
      content: body.message,
    });

    const result = streamText({
      model: getGroqChatModel(GROQ_DEFAULT_MODEL),
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(conversation.businessName),
        },
        ...conversation.history.map((historyMessage) => ({
          role: historyMessage.role,
          content: historyMessage.content,
        })),
        {
          role: "user",
          content: body.message,
        },
      ],
      onEnd: async (event) => {
        const assistantText = event.text.trim();

        if (!assistantText) {
          return;
        }

        await insertAnonymousSessionMessage({
          businessId: conversation.businessId,
          sessionId: conversation.sessionId,
          role: "assistant",
          content: assistantText,
          inputTokens: event.usage.inputTokens,
          outputTokens: event.usage.outputTokens,
          totalTokens: event.usage.totalTokens,
          provider: GROQ_PROVIDER_NAME,
          model: GROQ_DEFAULT_MODEL,
        });
      },
    });

    return noStore(
      result.toTextStreamResponse({
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      }),
    );
  } catch {
    return errorResponse(500, "Unable to process chat message.");
  }
}
