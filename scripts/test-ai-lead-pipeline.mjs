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

if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
  throw new Error("DATABASE_URL and DIRECT_URL are required.");
}

const { closePrivilegedDb } = await import("../src/db/index.ts");
const { normalizeLeadExtraction } = await import(
  "../src/ai/lead-extraction.ts"
);
const { saveAnonymousLeadQualification } = await import(
  "../src/data/public-chat.ts"
);

const direct = postgres(process.env.DIRECT_URL, {
  max: 1,
  prepare: false,
});

const sessionId = randomUUID();
const visitorId = randomUUID();
let leadId;

const firstExtraction = {
  name: "Priya Shah",
  email: null,
  company: "Lumen Commerce",
  role: "Growth Manager",
  companySize: null,
  useCase: "Answer product questions for visitors comparing vendors.",
  budget: null,
  timeline: null,
  productInterest: "Product Q&A and lead capture",
  buyingIntent: "Medium",
  qualificationComplete: false,
};

const secondExtraction = {
  name: null,
  email: "PRIYA.SHAH@EXAMPLE.TEST",
  company: null,
  role: null,
  companySize: "11-50",
  useCase: null,
  budget: "$500-$1,000/month",
  timeline: "Next month",
  productInterest: null,
  buyingIntent: "High",
  qualificationComplete: true,
};

let testError;

try {
  const [business] = await direct`
    select id::text, slug
    from public.businesses
    where archived_at is null
    order by slug
    limit 1
  `;

  assert.ok(business, "an active business is required");

  await direct`
    insert into public.chat_sessions (id, business_id, visitor_id)
    values (
      ${sessionId}::uuid,
      ${business.id}::uuid,
      ${visitorId}::uuid
    )
  `;

  const first = await saveAnonymousLeadQualification({
    sessionId,
    visitorId,
    businessSlug: business.slug,
    extraction: normalizeLeadExtraction(firstExtraction),
  });

  assert.ok(first);
  assert.equal(first.qualificationStatus, "qualifying");
  assert.equal(first.score, 57);
  leadId = first.leadId;

  const [associatedSession] = await direct`
    select lead_id::text
    from public.chat_sessions
    where id = ${sessionId}::uuid
  `;
  assert.equal(associatedSession.lead_id, leadId);

  const second = await saveAnonymousLeadQualification({
    sessionId,
    visitorId,
    businessSlug: business.slug,
    extraction: normalizeLeadExtraction(secondExtraction),
  });

  assert.ok(second);
  assert.equal(second.leadId, leadId);
  assert.equal(second.qualificationStatus, "qualified");
  assert.equal(second.score, 100);

  const [lead] = await direct`
    select
      email,
      company_size,
      budget,
      timeline,
      qualification_status,
      score,
      score_breakdown,
      score_explanation
    from public.leads
    where id = ${leadId}::uuid
      and business_id = ${business.id}::uuid
  `;

  assert.deepEqual(lead, {
    email: "priya.shah@example.test",
    company_size: "11-50",
    budget: "$500-$1,000/month",
    timeline: "Next month",
    qualification_status: "qualified",
    score: 100,
    score_breakdown: { fit: 35, intent: 35, readiness: 30 },
    score_explanation:
      "Deterministic score: 100/100 (fit 35/35, intent 35/35, readiness 30/30). Qualification status: qualified.",
  });

  const wrongVisitor = await saveAnonymousLeadQualification({
    sessionId,
    visitorId: randomUUID(),
    businessSlug: business.slug,
    extraction: normalizeLeadExtraction(firstExtraction),
  });
  assert.equal(wrongVisitor, null);

  console.log("AI lead persistence and merge tests passed.");
} catch (error) {
  testError = error;
  console.error("AI lead persistence and merge tests failed.");
  console.error(error instanceof Error ? error.stack : error);
} finally {
  await direct`
    delete from public.chat_sessions
    where id = ${sessionId}::uuid
  `;

  if (leadId) {
    await direct`
      delete from public.leads
      where id = ${leadId}::uuid
    `;
  }

  await direct.end({ timeout: 5 });
  await closePrivilegedDb();
}

process.exitCode = testError ? 1 : 0;
