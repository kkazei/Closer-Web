import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import postgres from "postgres";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

if (!process.env.DIRECT_URL) {
  throw new Error("DIRECT_URL is required.");
}

const { POST } = await import("../src/app/api/chat/session/route.ts");
const { closePrivilegedDb } = await import("../src/db/index.ts");
const {
  ANONYMOUS_SESSION_CREATION_LIMIT,
  MALFORMED_REQUEST_LIMIT,
} = await import("../src/lib/rate-limit.ts");

const direct = postgres(process.env.DIRECT_URL, {
  max: 1,
  prepare: false,
});

const createdSessionIds = new Set();
const archivedBusiness = {
  id: randomUUID(),
  slug: `db010-archived-${randomUUID().slice(0, 8)}`,
};

function requestFor(body, { cookie, ip, rawBody } = {}) {
  const headers = {
    "content-type": "application/json",
    "x-forwarded-for": ip ?? `db010-${randomUUID()}`,
  };

  if (cookie) {
    headers.cookie = cookie;
  }

  return new Request("http://localhost/api/chat/session", {
    method: "POST",
    headers,
    body: rawBody ?? JSON.stringify(body),
  });
}

async function callRoute(body, options = {}) {
  const response = await POST(requestFor(body, options));
  const data = await response.json();

  if (response.status === 201 && data.sessionId) {
    createdSessionIds.add(data.sessionId);
  }

  return { response, data };
}

function visitorCookieFrom(response) {
  const setCookie = response.headers.get("set-cookie");

  assert.ok(setCookie, "a successful first request must set the visitor cookie");
  assert.match(setCookie.toLowerCase(), /httponly/);
  assert.match(setCookie.toLowerCase(), /secure/);
  assert.match(setCookie.toLowerCase(), /samesite=lax/);
  assert.match(setCookie.toLowerCase(), /path=\//);
  assert.match(setCookie.toLowerCase(), /max-age=2592000/);

  const match = setCookie.match(/(?:^|,\s*)closer_visitor_id=([^;]+)/);
  assert.ok(match, "the response must set closer_visitor_id");

  return `closer_visitor_id=${match[1]}`;
}

async function readSession(sessionId) {
  const [row] = await direct`
    select
      id::text,
      business_id::text,
      visitor_id::text
    from public.chat_sessions
    where id = ${sessionId}::uuid
  `;

  assert.ok(row, `session ${sessionId} must exist`);
  return row;
}

async function main() {
  const [businessA, businessB] = await direct`
    select id::text, slug
    from public.businesses
    where archived_at is null
    order by slug
    limit 2
  `;

  assert.ok(businessA, "at least one active business is required");

  await direct`
    insert into public.businesses (id, name, slug, archived_at)
    values (
      ${archivedBusiness.id}::uuid,
      'DB-010 Archived Business',
      ${archivedBusiness.slug},
      now()
    )
  `;

  const first = await callRoute(
    { businessSlug: businessA.slug },
    { ip: `db010-first-${randomUUID()}` },
  );
  assert.equal(first.response.status, 201);
  assert.deepEqual(Object.keys(first.data).sort(), ["expiresAt", "sessionId"]);
  const visitorCookie = visitorCookieFrom(first.response);
  const firstSession = await readSession(first.data.sessionId);
  assert.equal(firstSession.business_id, businessA.id);

  const repeated = await callRoute(
    { businessSlug: businessA.slug },
    { cookie: visitorCookie, ip: `db010-repeat-${randomUUID()}` },
  );
  assert.equal(repeated.response.status, 201);
  const repeatedSession = await readSession(repeated.data.sessionId);
  assert.notEqual(repeated.data.sessionId, first.data.sessionId);
  assert.equal(repeatedSession.visitor_id, firstSession.visitor_id);

  const missingCookie = await callRoute(
    { businessSlug: businessA.slug },
    { ip: `db010-missing-${randomUUID()}` },
  );
  assert.equal(missingCookie.response.status, 201);
  const missingCookieValue = visitorCookieFrom(missingCookie.response);
  const missingCookieSession = await readSession(missingCookie.data.sessionId);
  assert.notEqual(missingCookieSession.visitor_id, firstSession.visitor_id);
  assert.notEqual(missingCookieValue, visitorCookie);

  const invalidCookie = await callRoute(
    { businessSlug: businessA.slug },
    {
      cookie: "closer_visitor_id=not-a-uuid",
      ip: `db010-invalid-cookie-${randomUUID()}`,
    },
  );
  assert.equal(invalidCookie.response.status, 201);
  const replacementCookie = visitorCookieFrom(invalidCookie.response);
  assert.notEqual(replacementCookie, "closer_visitor_id=not-a-uuid");

  const visitorSpoof = await callRoute(
    {
      businessSlug: businessA.slug,
      visitorId: randomUUID(),
    },
    { ip: `db010-visitor-spoof-${randomUUID()}` },
  );
  assert.equal(visitorSpoof.response.status, 400);

  const businessIdSpoof = await callRoute(
    {
      businessSlug: businessA.slug,
      businessId: businessA.id,
    },
    { ip: `db010-business-spoof-${randomUUID()}` },
  );
  assert.equal(businessIdSpoof.response.status, 400);

  const invalidBusiness = await callRoute(
    { businessSlug: `db010-not-found-${randomUUID().slice(0, 8)}` },
    { ip: `db010-invalid-business-${randomUUID()}` },
  );
  assert.equal(invalidBusiness.response.status, 404);
  assert.deepEqual(invalidBusiness.data, { error: "Business not found." });

  const archived = await callRoute(
    { businessSlug: archivedBusiness.slug },
    { ip: `db010-archived-${randomUUID()}` },
  );
  assert.equal(archived.response.status, 404);
  assert.deepEqual(archived.data, { error: "Business not found." });

  if (businessB) {
    const otherBusiness = await callRoute(
      { businessSlug: businessB.slug },
      { ip: `db010-other-business-${randomUUID()}` },
    );
    assert.equal(otherBusiness.response.status, 201);
    const otherSession = await readSession(otherBusiness.data.sessionId);
    assert.equal(otherSession.business_id, businessB.id);
    assert.notEqual(otherSession.business_id, firstSession.business_id);
  }

  const rateLimitCookie = `closer_visitor_id=${randomUUID()}`;
  const rateLimitIp = `db010-rate-limit-${randomUUID()}`;

  for (let attempt = 0; attempt < ANONYMOUS_SESSION_CREATION_LIMIT; attempt += 1) {
    const result = await callRoute(
      { businessSlug: businessA.slug },
      { cookie: rateLimitCookie, ip: rateLimitIp },
    );
    assert.equal(result.response.status, 201);
  }

  const rateLimited = await callRoute(
    { businessSlug: businessA.slug },
    { cookie: rateLimitCookie, ip: rateLimitIp },
  );
  assert.equal(rateLimited.response.status, 429);
  assert.equal(rateLimited.data.error, "Too many requests.");
  assert.ok(rateLimited.response.headers.get("retry-after"));

  const malformedIp = `db010-malformed-${randomUUID()}`;

  for (let attempt = 0; attempt < MALFORMED_REQUEST_LIMIT; attempt += 1) {
    const result = await callRoute(undefined, {
      ip: malformedIp,
      rawBody: "not-json",
    });
    assert.equal(result.response.status, 400);
  }

  const malformedLimited = await callRoute(undefined, {
    ip: malformedIp,
    rawBody: "not-json",
  });
  assert.equal(malformedLimited.response.status, 429);
  assert.equal(malformedLimited.data.error, "Too many requests.");
}

let testError;

try {
  await main();
  console.log("Public anonymous chat boundary tests passed.");
} catch (error) {
  testError = error;
  console.error("Public anonymous chat boundary tests failed.");
  console.error(error instanceof Error ? error.stack : error);
} finally {
  for (const sessionId of createdSessionIds) {
    await direct`
      delete from public.chat_sessions
      where id = ${sessionId}::uuid
    `;
  }

  await direct`
    delete from public.businesses
    where id = ${archivedBusiness.id}::uuid
  `;

  await direct.end({ timeout: 5 });
  await closePrivilegedDb();
}

process.exitCode = testError ? 1 : 0;
