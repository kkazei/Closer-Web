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
const { ingestKnowledgeDocument } = await import("../src/rag/ingestion.ts");

const direct = postgres(process.env.DIRECT_URL, {
  max: 1,
  prepare: false,
});

const businessAId = randomUUID();
const businessBId = randomUUID();
const documentId = randomUUID();
const crossTenantDocumentId = randomUUID();
const model = "test/rag-embedding-model";
const content = Array.from(
  { length: 30 },
  (_, index) =>
    `Knowledge paragraph ${index + 1}. ` +
    "This is deterministic development content used to exercise safe chunk replacement. ".repeat(
      5,
    ),
).join("\n\n");

let actorId;
let testError;

function fakeProvider({ failOnCall } = {}) {
  let calls = 0;

  return {
    model,
    async embedText(text) {
      calls += 1;
      assert.ok(text.trim());

      if (failOnCall && calls === failOnCall) {
        throw new Error("simulated provider failure");
      }

      return Array.from({ length: 384 }, (_, index) => index / 384);
    },
  };
}

try {
  const [membership] = await direct`
    select profile_id::text as profile_id
    from public.business_memberships
    where role in ('owner', 'admin')
    order by created_at
    limit 1
  `;

  assert.ok(
    membership?.profile_id,
    "an existing owner/admin membership is required; seed an Auth profile first",
  );
  actorId = membership.profile_id;

  const [business] = await direct`
    select business_id::text as business_id
    from public.business_memberships
    where profile_id = ${actorId}::uuid
      and role in ('owner', 'admin')
    order by created_at
    limit 1
  `;
  assert.ok(business?.business_id);

  await direct`
    insert into public.businesses (id, name, slug)
    values
      (${businessAId}::uuid, 'RAG Test Business A', ${`rag-test-a-${businessAId}`}),
      (${businessBId}::uuid, 'RAG Test Business B', ${`rag-test-b-${businessBId}`})
  `;

  await direct`
    insert into public.business_memberships (business_id, profile_id, role)
    values (${businessAId}::uuid, ${actorId}::uuid, 'owner')
  `;

  await direct`
    insert into public.knowledge_documents (
      id, business_id, created_by_profile_id, name, document_type, status
    )
    values (
      ${documentId}::uuid,
      ${businessAId}::uuid,
      ${actorId}::uuid,
      'RAG ingestion test document',
      'text',
      'draft'
    )
  `;

  await direct`
    insert into public.knowledge_documents (
      id, business_id, created_by_profile_id, name, document_type, status
    )
    values (
      ${crossTenantDocumentId}::uuid,
      ${businessBId}::uuid,
      ${actorId}::uuid,
      'RAG cross tenant test document',
      'text',
      'draft'
    )
  `;

  const first = await ingestKnowledgeDocument({
    authenticatedUserId: actorId,
    businessId: businessAId,
    documentId,
    content,
    provider: fakeProvider(),
  });
  assert.equal(first.status, "ready");
  assert.ok(first.chunkCount > 1);
  assert.equal(first.embeddingModel, model);

  const [storedDocument] = await direct`
    select status, count(c.id)::int as chunk_count
    from public.knowledge_documents d
    left join public.document_chunks c
      on c.business_id = d.business_id and c.document_id = d.id
    where d.id = ${documentId}::uuid
    group by d.status, d.id
  `;
  assert.equal(storedDocument.status, "ready");
  assert.equal(storedDocument.chunk_count, first.chunkCount);

  const oldChunks = await direct`
    select chunk_index, content, embedding_model
    from public.document_chunks
    where business_id = ${businessAId}::uuid
      and document_id = ${documentId}::uuid
    order by chunk_index
  `;
  assert.equal(oldChunks[0].embedding_model, model);

  await assert.rejects(
    () =>
      ingestKnowledgeDocument({
        authenticatedUserId: actorId,
        businessId: businessAId,
        documentId,
        content,
        provider: fakeProvider({ failOnCall: 2 }),
      }),
    /ingestion failed/i,
  );

  const [failedDocument] = await direct`
    select status from public.knowledge_documents where id = ${documentId}::uuid
  `;
  assert.equal(failedDocument.status, "failed");
  const failedChunks = await direct`
    select chunk_index, content, embedding_model
    from public.document_chunks
    where business_id = ${businessAId}::uuid
      and document_id = ${documentId}::uuid
    order by chunk_index
  `;
  assert.deepEqual(failedChunks, oldChunks);

  const replacement = await ingestKnowledgeDocument({
    authenticatedUserId: actorId,
    businessId: businessAId,
    documentId,
    content: "Replacement knowledge content.",
    provider: fakeProvider(),
  });
  assert.equal(replacement.status, "ready");
  assert.equal(replacement.chunkCount, 1);

  const replacedChunks = await direct`
    select chunk_index, content, embedding_model
    from public.document_chunks
    where business_id = ${businessAId}::uuid
      and document_id = ${documentId}::uuid
    order by chunk_index
  `;
  assert.deepEqual(replacedChunks, [
    {
      chunk_index: 0,
      content: "Replacement knowledge content.",
      embedding_model: model,
    },
  ]);

  await assert.rejects(
    () =>
      ingestKnowledgeDocument({
        authenticatedUserId: actorId,
        businessId: businessBId,
        documentId: crossTenantDocumentId,
        content: "Cross tenant content.",
        provider: fakeProvider(),
      }),
    /owner|administrator|membership|not found/i,
  );

  const [crossTenantStatus] = await direct`
    select status from public.knowledge_documents where id = ${crossTenantDocumentId}::uuid
  `;
  assert.equal(crossTenantStatus.status, "draft");

  console.log("RAG ingestion tests passed.");
} catch (error) {
  testError = error;
  console.error("RAG ingestion tests failed.");
  console.error(error instanceof Error ? error.stack : error);
} finally {
  try {
    await direct`
      delete from public.knowledge_documents
      where id in (${documentId}::uuid, ${crossTenantDocumentId}::uuid)
    `;
    await direct`
      delete from public.business_memberships
      where business_id = ${businessAId}::uuid
    `;
    await direct`
      delete from public.businesses
      where id in (${businessAId}::uuid, ${businessBId}::uuid)
    `;
  } catch (error) {
    testError ??= error;
    console.error("RAG ingestion fixture cleanup failed.");
    console.error(error instanceof Error ? error.message : error);
  }
  await direct.end({ timeout: 5 });
  await closePrivilegedDb();
}

process.exitCode = testError ? 1 : 0;
