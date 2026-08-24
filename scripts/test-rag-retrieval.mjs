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

const { closePrivilegedDb, withAuthenticatedDb } = await import(
  "../src/db/index.ts"
);
const { EMBEDDING_MODEL } = await import("../src/rag/embeddings.ts");
const {
  DEFAULT_SIMILARITY_THRESHOLD,
  MAX_RETRIEVAL_TOP_K,
  retrieveKnowledge,
} = await import("../src/rag/retrieval.ts");

const direct = postgres(process.env.DIRECT_URL, {
  max: 1,
  prepare: false,
});

const actorA = { id: randomUUID(), email: "rag-retrieval-a@example.invalid" };
const actorB = { id: randomUUID(), email: "rag-retrieval-b@example.invalid" };
const businessAId = randomUUID();
const businessBId = randomUUID();
const relevantDocumentId = randomUUID();
const wrongModelDocumentId = randomUUID();
const businessBDocumentId = randomUUID();
const statusDocumentIds = Object.fromEntries(
  ["draft", "processing", "ready", "failed", "archived"].map((status) => [
    status,
    randomUUID(),
  ]),
);
const relevantChunkIds = [randomUUID(), randomUUID()];
const statusReadyChunkId = randomUUID();
const wrongModelChunkId = randomUUID();
const businessBChunkId = randomUUID();
const allDocumentIds = [
  relevantDocumentId,
  wrongModelDocumentId,
  businessBDocumentId,
  ...Object.values(statusDocumentIds),
];

const vectorFor = (coordinates = []) => {
  const vector = Array.from({ length: 384 }, () => 0);

  for (const [index, value] of coordinates) {
    vector[index] = value;
  }

  return vector;
};

const saasVector = vectorFor([
  [0, 1],
]);
const constructionVector = vectorFor([
  [1, 1],
]);
const irrelevantVector = vectorFor([
  [2, 1],
]);

async function insertAuthUser(user) {
  await direct`
    insert into auth.users (
      id, aud, role, email, created_at, updated_at, is_sso_user, is_anonymous
    )
    values (
      ${user.id}::uuid,
      'authenticated',
      'authenticated',
      ${user.email},
      now(),
      now(),
      false,
      false
    )
  `;
}

async function insertDocument(id, businessId, profileId, status, name) {
  await direct`
    insert into public.knowledge_documents (
      id, business_id, created_by_profile_id, name, document_type, status
    )
    values (
      ${id}::uuid,
      ${businessId}::uuid,
      ${profileId}::uuid,
      ${name},
      'text',
      ${status}::document_status
    )
  `;
}

async function insertChunk({
  id,
  businessId,
  documentId,
  chunkIndex,
  content,
  embedding,
  embeddingModel = EMBEDDING_MODEL,
}) {
  await direct`
    insert into public.document_chunks (
      id,
      business_id,
      document_id,
      chunk_index,
      content,
      metadata,
      embedding,
      embedding_model
    )
    values (
      ${id}::uuid,
      ${businessId}::uuid,
      ${documentId}::uuid,
      ${chunkIndex},
      ${content},
      ${direct.json({ test: "rag-retrieval" })}::jsonb,
      ${JSON.stringify(embedding)}::vector,
      ${embeddingModel}
    )
  `;
}

async function setupFixtures() {
  await insertAuthUser(actorA);
  await insertAuthUser(actorB);

  await direct`
    insert into public.profiles (id, full_name)
    values
      (${actorA.id}::uuid, 'RAG retrieval test A'),
      (${actorB.id}::uuid, 'RAG retrieval test B')
  `;

  await direct`
    insert into public.businesses (id, name, slug)
    values
      (${businessAId}::uuid, 'RAG Retrieval Business A', ${`rag-retrieval-a-${businessAId}`}),
      (${businessBId}::uuid, 'RAG Retrieval Business B', ${`rag-retrieval-b-${businessBId}`})
  `;

  await direct`
    insert into public.business_memberships (business_id, profile_id, role)
    values
      (${businessAId}::uuid, ${actorA.id}::uuid, 'owner'),
      (${businessBId}::uuid, ${actorB.id}::uuid, 'owner')
  `;

  await insertDocument(
    relevantDocumentId,
    businessAId,
    actorA.id,
    "ready",
    "SaaS lead qualification",
  );
  await insertDocument(
    wrongModelDocumentId,
    businessAId,
    actorA.id,
    "ready",
    "Incompatible embedding model",
  );
  await insertDocument(
    businessBDocumentId,
    businessBId,
    actorB.id,
    "ready",
    "Construction accounting",
  );

  for (const [status, documentId] of Object.entries(statusDocumentIds)) {
    await insertDocument(
      documentId,
      businessAId,
      actorA.id,
      status,
      `Status fixture: ${status}`,
    );
  }

  await insertChunk({
    id: relevantChunkIds[0],
    businessId: businessAId,
    documentId: relevantDocumentId,
    chunkIndex: 0,
    content: "The platform automates SaaS lead qualification.",
    embedding: saasVector,
  });
  await insertChunk({
    id: relevantChunkIds[1],
    businessId: businessAId,
    documentId: relevantDocumentId,
    chunkIndex: 1,
    content: "Qualification uses fit, intent, and readiness signals.",
    embedding: vectorFor([
      [0, 0.8],
      [1, 0.6],
    ]),
  });
  await insertChunk({
    id: statusReadyChunkId,
    businessId: businessAId,
    documentId: statusDocumentIds.ready,
    chunkIndex: 0,
    content: "Ready status knowledge is eligible for retrieval.",
    embedding: saasVector,
  });

  for (const status of ["draft", "processing", "failed", "archived"]) {
    await insertChunk({
      id: randomUUID(),
      businessId: businessAId,
      documentId: statusDocumentIds[status],
      chunkIndex: 0,
      content: `${status} knowledge must not be retrieved.`,
      embedding: saasVector,
    });
  }

  await insertChunk({
    id: wrongModelChunkId,
    businessId: businessAId,
    documentId: wrongModelDocumentId,
    chunkIndex: 0,
    content: "This chunk uses an incompatible embedding model.",
    embedding: saasVector,
    embeddingModel: "different/embedding-model",
  });
  await insertChunk({
    id: businessBChunkId,
    businessId: businessBId,
    documentId: businessBDocumentId,
    chunkIndex: 0,
    content: "Construction companies use accounting software.",
    embedding: constructionVector,
  });
}

function fakeProvider(embedding, { failure = false } = {}) {
  return {
    model: EMBEDDING_MODEL,
    async embedText() {
      if (failure) {
        throw new Error("simulated embedding provider failure");
      }

      return embedding;
    },
  };
}

async function asUser(userId, input) {
  return withAuthenticatedDb({ userId }, () => retrieveKnowledge(input));
}

let testError;

try {
  await setupFixtures();

  const relevant = await asUser(actorA.id, {
    businessId: businessAId,
    query: "How does the platform qualify SaaS leads?",
    provider: fakeProvider(saasVector),
  });
  assert.equal(relevant.length, 3);
  assert.ok(relevant.every((result) => !("embedding" in result)));
  assert.deepEqual(
    relevant
      .filter((result) => Math.abs(result.similarity - 1) < 0.001)
      .map((result) => result.chunkId)
      .sort(),
    [relevantChunkIds[0], statusReadyChunkId].sort(),
  );
  assert.equal(relevant[2].chunkId, relevantChunkIds[1]);
  assert.ok(Math.abs(relevant[2].similarity - 0.8) < 0.01);

  const readyDocumentIds = new Set(relevant.map((result) => result.documentId));
  assert.ok(readyDocumentIds.has(relevantDocumentId));
  assert.ok(readyDocumentIds.has(statusDocumentIds.ready));
  for (const status of ["draft", "processing", "failed", "archived"]) {
    assert.equal(readyDocumentIds.has(statusDocumentIds[status]), false);
  }
  assert.equal(readyDocumentIds.has(wrongModelDocumentId), false);

  const topOne = await asUser(actorA.id, {
    businessId: businessAId,
    query: "SaaS leads",
    topK: 1,
    provider: fakeProvider(saasVector),
  });
  assert.equal(topOne.length, 1);

  const topTen = await asUser(actorA.id, {
    businessId: businessAId,
    query: "SaaS leads",
    topK: MAX_RETRIEVAL_TOP_K,
    provider: fakeProvider(saasVector),
  });
  assert.equal(topTen.length, 3);

  const highThreshold = await asUser(actorA.id, {
    businessId: businessAId,
    query: "SaaS leads",
    similarityThreshold: 0.9,
    provider: fakeProvider(saasVector),
  });
  assert.equal(highThreshold.length, 2);
  assert.equal(DEFAULT_SIMILARITY_THRESHOLD, 0.55);

  const irrelevant = await asUser(actorA.id, {
    businessId: businessAId,
    query: "unrelated question",
    provider: fakeProvider(irrelevantVector),
  });
  assert.deepEqual(irrelevant, []);

  const businessBResults = await asUser(actorB.id, {
    businessId: businessBId,
    query: "construction accounting",
    provider: fakeProvider(constructionVector),
  });
  assert.equal(businessBResults.length, 1);
  assert.equal(businessBResults[0].chunkId, businessBChunkId);

  const crossTenantResults = await asUser(actorA.id, {
    businessId: businessBId,
    query: "construction accounting",
    provider: fakeProvider(constructionVector),
  });
  assert.deepEqual(crossTenantResults, []);

  await assert.rejects(
    () =>
      retrieveKnowledge({
        businessId: businessAId,
        query: "SaaS leads",
        provider: fakeProvider(saasVector),
      }),
    /The retrieve knowledge could not be completed/,
  );

  await assert.rejects(
    () =>
      asUser(actorA.id, {
        businessId: businessAId,
        query: "   ",
        provider: fakeProvider(saasVector),
      }),
    /query must not be blank/i,
  );
  await assert.rejects(
    () =>
      asUser(actorA.id, {
        businessId: businessAId,
        query: "SaaS leads",
        topK: MAX_RETRIEVAL_TOP_K + 1,
        provider: fakeProvider(saasVector),
      }),
    /topK must be an integer/i,
  );
  await assert.rejects(
    () =>
      asUser(actorA.id, {
        businessId: businessAId,
        query: "SaaS leads",
        similarityThreshold: 1.1,
        provider: fakeProvider(saasVector),
      }),
    /similarityThreshold must be between/i,
  );

  await assert.rejects(
    () =>
      asUser(actorA.id, {
        businessId: businessAId,
        query: "SaaS leads",
        provider: {
          model: "different/embedding-model",
          embedText: async () => saasVector,
        },
      }),
    /Query embeddings must use/i,
  );
  await assert.rejects(
    () =>
      asUser(actorA.id, {
        businessId: businessAId,
        query: "SaaS leads",
        provider: {
          model: EMBEDDING_MODEL,
          embedText: async () => Array.from({ length: 383 }, () => 0),
        },
      }),
    /query embedding must contain exactly 384 dimensions/i,
  );
  await assert.rejects(
    () =>
      asUser(actorA.id, {
        businessId: businessAId,
        query: "SaaS leads",
        provider: fakeProvider(saasVector, { failure: true }),
      }),
    /query embedding must contain exactly 384 dimensions/i,
  );

  console.log("RAG retrieval tests passed.");
} catch (error) {
  testError = error;
  console.error("RAG retrieval tests failed.");
  console.error(error instanceof Error ? error.stack : error);
} finally {
  try {
    for (const documentId of allDocumentIds) {
      await direct`
        delete from public.knowledge_documents
        where id = ${documentId}::uuid
      `;
    }
    await direct`
      delete from public.business_memberships
      where business_id in (${businessAId}::uuid, ${businessBId}::uuid)
    `;
    await direct`
      delete from public.profiles
      where id in (${actorA.id}::uuid, ${actorB.id}::uuid)
    `;
    await direct`
      delete from auth.users
      where id in (${actorA.id}::uuid, ${actorB.id}::uuid)
    `;
    await direct`
      delete from public.businesses
      where id in (${businessAId}::uuid, ${businessBId}::uuid)
    `;
  } catch (error) {
    testError ??= error;
    console.error("RAG retrieval fixture cleanup failed.");
    console.error(error instanceof Error ? error.message : error);
  }

  await direct.end({ timeout: 5 });
  await closePrivilegedDb();
}

process.exitCode = testError ? 1 : 0;
