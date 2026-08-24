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

if (!process.env.GROQ_API_KEY || !process.env.HF_TOKEN) {
  throw new Error("GROQ_API_KEY and HF_TOKEN are required for the live test.");
}

const { POST } = await import("../src/app/api/chat/route.ts");
const { closePrivilegedDb } = await import("../src/db/index.ts");
const {
  EMBEDDING_MODEL,
  getHuggingFaceEmbeddingProvider,
} = await import("../src/rag/embeddings.ts");

const direct = postgres(process.env.DIRECT_URL, {
  max: 1,
  prepare: false,
});

const fixture = {
  businessId: randomUUID(),
  businessSlug: `rag-live-${randomUUID()}`,
  sessionId: randomUUID(),
  visitorId: randomUUID(),
  documentId: randomUUID(),
  leadId: undefined,
};

const knowledgeContent =
  "Our product provides automated lead qualification for SaaS sales teams. " +
  "It supports conversational qualification and lead scoring.";

function requestFor(message) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `closer_visitor_id=${fixture.visitorId}`,
      "x-forwarded-for": `rag-live-${randomUUID()}`,
    },
    body: JSON.stringify({
      businessSlug: fixture.businessSlug,
      sessionId: fixture.sessionId,
      message,
    }),
  });
}

async function callRoute(message) {
  const response = await POST(requestFor(message));
  return { response, text: await response.text() };
}

async function setupFixtures() {
  await direct`
    insert into public.businesses (id, name, slug)
    values (
      ${fixture.businessId}::uuid,
      'Live RAG Test Business',
      ${fixture.businessSlug}
    )
  `;

  await direct`
    insert into public.chat_sessions (id, business_id, visitor_id)
    values (
      ${fixture.sessionId}::uuid,
      ${fixture.businessId}::uuid,
      ${fixture.visitorId}::uuid
    )
  `;

  await direct`
    insert into public.knowledge_documents (
      id, business_id, name, document_type, status
    )
    values (
      ${fixture.documentId}::uuid,
      ${fixture.businessId}::uuid,
      'Live RAG knowledge',
      'text',
      'ready'
    )
  `;

  const provider = getHuggingFaceEmbeddingProvider();
  const embedding = await provider.embedText(knowledgeContent);
  assert.equal(embedding.length, 384);

  await direct`
    insert into public.document_chunks (
      id, business_id, document_id, chunk_index, content, metadata,
      embedding, embedding_model
    )
    values (
      ${randomUUID()}::uuid,
      ${fixture.businessId}::uuid,
      ${fixture.documentId}::uuid,
      0,
      ${knowledgeContent},
      ${direct.json({ source: "live RAG smoke test" })}::jsonb,
      ${JSON.stringify(embedding)}::vector,
      ${EMBEDDING_MODEL}
    )
  `;
}

let testError;

try {
  await setupFixtures();

  const grounded = await callRoute(
    "How does your product help SaaS sales teams qualify leads?",
  );
  assert.equal(grounded.response.status, 200);
  assert.match(grounded.response.headers.get("content-type") ?? "", /text\/plain/);
  assert.ok(grounded.text.trim().length > 0);
  assert.match(grounded.text, /lead|qualif|SaaS/i);

  const [groundedMessage] = await direct`
    select metadata
    from public.messages
    where session_id = ${fixture.sessionId}::uuid
      and role = 'assistant'
    order by created_at, id
    limit 1
  `;
  assert.equal(groundedMessage.metadata.ragUsed, true);
  assert.ok(groundedMessage.metadata.retrievalCount >= 1);

  const negative = await callRoute(
    "What is your office address in Tokyo for the quantum battery division?",
  );
  assert.equal(negative.response.status, 200);
  assert.ok(negative.text.trim().length > 0);
  const normalizedNegativeText = negative.text.replace(/\u2019/g, "'");

  const [negativeMessage] = await direct`
    select metadata
    from public.messages
    where session_id = ${fixture.sessionId}::uuid
      and role = 'assistant'
    order by created_at desc, id desc
    limit 1
  `;
  assert.equal(negativeMessage.metadata.ragUsed, false);
  assert.equal(negativeMessage.metadata.retrievalCount, 0);
  assert.match(
    normalizedNegativeText,
    /do not|don['’]t|not available|not contain|unknown|cannot|can['’]t|don['’]t have/i,
  );

  const [lead] = await direct`
    select id::text
    from public.leads
    where business_id = ${fixture.businessId}::uuid
    limit 1
  `;
  if (lead) {
    fixture.leadId = lead.id;
  }

  console.log("Live RAG chat smoke test passed.");
  console.log(
    JSON.stringify({
      streamedGroundedResponse: true,
      groundedRetrievalPersisted: groundedMessage.metadata.retrievalCount,
      negativeRetrievalCount: negativeMessage.metadata.retrievalCount,
      responseCharacters: grounded.text.length,
    }),
  );
} catch (error) {
  testError = error;
  console.error("Live RAG chat smoke test failed.");
  console.error(error instanceof Error ? error.stack : error);
} finally {
  try {
    await direct`
      update public.chat_sessions
      set lead_id = null
      where id = ${fixture.sessionId}::uuid
    `;
    await direct`
      delete from public.chat_sessions
      where id = ${fixture.sessionId}::uuid
    `;
    await direct`
      delete from public.leads
      where business_id = ${fixture.businessId}::uuid
    `;
    await direct`
      delete from public.knowledge_documents
      where id = ${fixture.documentId}::uuid
    `;
    await direct`
      delete from public.businesses
      where id = ${fixture.businessId}::uuid
    `;
  } catch (error) {
    testError ??= error;
    console.error("Live RAG fixture cleanup failed.");
    console.error(error instanceof Error ? error.message : error);
  }

  await direct.end({ timeout: 5 });
  await closePrivilegedDb();
}

process.exitCode = testError ? 1 : 0;
