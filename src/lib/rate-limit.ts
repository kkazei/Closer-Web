import "server-only";

export const ANONYMOUS_SESSION_CREATION_LIMIT = 5;
export const ANONYMOUS_SESSION_CREATION_WINDOW_MS = 10 * 60 * 1000;
export const ANONYMOUS_MESSAGE_LIMIT = 20;
export const ANONYMOUS_MESSAGE_WINDOW_MS = 60 * 1000;
export const MALFORMED_REQUEST_LIMIT = 20;
export const MALFORMED_REQUEST_WINDOW_MS = 60 * 1000;

const MAX_BUCKETS = 10_000;

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitResult = Readonly<{
  allowed: boolean;
  retryAfterSeconds: number;
}>;

export function getRequestAbuseKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0];
  const realIp = request.headers.get("x-real-ip");
  const candidate = (forwarded ?? realIp ?? "unknown").trim();

  return candidate.length > 0 && candidate.length <= 128 ? candidate : "unknown";
}

function pruneBuckets(now: number): void {
  if (buckets.size < MAX_BUCKETS) {
    return;
  }

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }

  if (buckets.size < MAX_BUCKETS) {
    return;
  }

  const oldestKey = buckets.keys().next().value;

  if (oldestKey) {
    buckets.delete(oldestKey);
  }
}

function consume(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  pruneBuckets(now);

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function consumeAnonymousSessionRateLimit(key: string): RateLimitResult {
  return consume(
    `anonymous-session:${key}`,
    ANONYMOUS_SESSION_CREATION_LIMIT,
    ANONYMOUS_SESSION_CREATION_WINDOW_MS,
  );
}

export function consumeAnonymousMessageRateLimit(key: string): RateLimitResult {
  return consume(
    `anonymous-message:${key}`,
    ANONYMOUS_MESSAGE_LIMIT,
    ANONYMOUS_MESSAGE_WINDOW_MS,
  );
}

export function consumeMalformedRequestRateLimit(
  key: string,
): RateLimitResult {
  return consume(
    `malformed-request:${key}`,
    MALFORMED_REQUEST_LIMIT,
    MALFORMED_REQUEST_WINDOW_MS,
  );
}
