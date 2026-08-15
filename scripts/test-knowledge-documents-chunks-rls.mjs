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
  throw new Error("DIRECT_URL is not configured.");
}

const client = postgres(process.env.DIRECT_URL, {
  max: 1,
  prepare: false,
});

const rollback = Symbol("rollback");
let savepointNumber = 0;

function fixtureUser(emailPrefix) {
  const id = randomUUID();

  return {
    id,
    email: `${emailPrefix}-${id}@example.invalid`,
  };
}

async function insertAuthUser(transaction, user) {
  await transaction`
    insert into auth.users (
      id,
      aud,
      role,
      email,
      created_at,
      updated_at,
      is_sso_user,
      is_anonymous
    ) values (
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

async function asAuthenticatedUser(transaction, userId, callback) {
  // Mirrors the transaction-local request context from withAuthenticatedDb.
  // The trusted direct role is used only to install rollback-only fixtures.
  await transaction.unsafe("set local role postgres");
  await transaction`select set_config('request.jwt.claim.sub', ${userId}, true)`;
  await transaction`select set_config('request.jwt.claim.role', 'authenticated', true)`;
  await transaction.unsafe("set local role authenticated");

  return callback(transaction);
}

async function asAnonymous(transaction, callback) {
  await transaction.unsafe("set local role postgres");
  await transaction.unsafe("reset request.jwt.claim.sub");
  await transaction.unsafe("reset request.jwt.claim.role");
  await transaction.unsafe("set local role anon");

  return callback(transaction);
}

async function expectDenied(transaction, operation, callback) {
  const savepoint = `closer_documents_chunks_denied_${savepointNumber++}`;

  await transaction.unsafe(`savepoint ${savepoint}`);

  try {
    await callback();
  } catch {
    await transaction.unsafe(`rollback to savepoint ${savepoint}`);
    return;
  }

  await transaction.unsafe(`rollback to savepoint ${savepoint}`);
  throw new Error(`${operation} was not denied.`);
}

async function expectNoRows(operation, callback) {
  const rows = await callback();
  assert.equal(rows.length, 0, `${operation} was not denied by RLS`);
}

async function runTests() {
  let result;

  try {
    await client.begin(async (transaction) => {
      const [session] = await transaction`
        select session_user::text as session_user
      `;

      assert.equal(
        session?.session_user,
        "postgres",
        "the rollback-only fixture transaction must use the trusted direct role",
      );

      const [businessA, businessB] = await transaction`
        select id::text
        from public.businesses
        order by slug
      `;

      assert.ok(businessA?.id, "the seeded first business is required");
      assert.ok(businessB?.id, "the seeded second business is required");

      const documentRows = await transaction`
        select distinct on (business_id)
          id::text,
          business_id::text,
          created_by_profile_id::text,
          status::text
        from public.knowledge_documents
        where business_id in (${businessA.id}::uuid, ${businessB.id}::uuid)
        order by business_id, id
      `;
      const chunkRows = await transaction`
        select distinct on (business_id)
          id::text,
          business_id::text,
          document_id::text,
          chunk_index,
          content
        from public.document_chunks
        where business_id in (${businessA.id}::uuid, ${businessB.id}::uuid)
        order by business_id, document_id, chunk_index
      `;

      const documentA = documentRows.find(
        (row) => row.business_id === businessA.id,
      );
      const documentB = documentRows.find(
        (row) => row.business_id === businessB.id,
      );
      const chunkA = chunkRows.find((row) => row.business_id === businessA.id);
      const chunkB = chunkRows.find((row) => row.business_id === businessB.id);

      assert.ok(documentA?.id, "the seeded Business A document is required");
      assert.ok(documentB?.id, "the seeded Business B document is required");
      assert.ok(chunkA?.id, "the seeded Business A chunk is required");
      assert.ok(chunkB?.id, "the seeded Business B chunk is required");

      const ownerA = fixtureUser("closer-knowledge-owner-a");
      const adminA = fixtureUser("closer-knowledge-admin-a");
      const memberA = fixtureUser("closer-knowledge-member-a");
      const userB = fixtureUser("closer-knowledge-user-b");
      const userC = fixtureUser("closer-knowledge-user-c");

      for (const user of [ownerA, adminA, memberA, userB, userC]) {
        await insertAuthUser(transaction, user);
        await transaction`
          insert into public.profiles (id, full_name)
          values (${user.id}::uuid, ${user.email})
        `;
      }

      await transaction`
        insert into public.business_memberships (business_id, profile_id, role)
        values
          (${businessA.id}::uuid, ${ownerA.id}::uuid, 'owner'),
          (${businessA.id}::uuid, ${adminA.id}::uuid, 'admin'),
          (${businessA.id}::uuid, ${memberA.id}::uuid, 'member'),
          (${businessB.id}::uuid, ${userB.id}::uuid, 'member')
      `;

      await asAuthenticatedUser(transaction, ownerA.id, async (scoped) => {
        const visibleDocumentA = await scoped`
          select id::text
          from public.knowledge_documents
          where id = ${documentA.id}::uuid
        `;
        const hiddenDocumentB = await scoped`
          select id::text
          from public.knowledge_documents
          where id = ${documentB.id}::uuid
        `;
        assert.equal(visibleDocumentA.length, 1, "owner A may read document A");
        assert.equal(hiddenDocumentB.length, 0, "owner A may not read document B");

        const visibleChunkA = await scoped`
          select id::text
          from public.document_chunks
          where id = ${chunkA.id}::uuid
        `;
        const hiddenChunkB = await scoped`
          select id::text
          from public.document_chunks
          where id = ${chunkB.id}::uuid
        `;
        assert.equal(visibleChunkA.length, 1, "owner A may read chunk A");
        assert.equal(hiddenChunkB.length, 0, "owner A may not read chunk B");

        const created = await scoped`
          insert into public.knowledge_documents (
            business_id,
            created_by_profile_id,
            name,
            document_type,
            source_uri,
            status,
            metadata
          ) values (
            ${businessA.id}::uuid,
            ${ownerA.id}::uuid,
            'Temporary RLS document',
            'text',
            'https://example.invalid/rls-test',
            'draft',
            '{"source":"rls-test"}'::jsonb
          )
          returning id::text, business_id::text, created_by_profile_id::text
        `;

        assert.equal(created.length, 1, "owner A may create document A");
        assert.equal(created[0].business_id, businessA.id);
        assert.equal(created[0].created_by_profile_id, ownerA.id);

        await expectDenied(transaction, "owner A creates document B", () =>
          scoped`
            insert into public.knowledge_documents (
              business_id,
              created_by_profile_id,
              name,
              document_type
            ) values (
              ${businessB.id}::uuid,
              ${ownerA.id}::uuid,
              'Cross-tenant document',
              'text'
            )
          `,
        );
        await expectDenied(transaction, "owner A spoofs created_by", () =>
          scoped`
            insert into public.knowledge_documents (
              business_id,
              created_by_profile_id,
              name,
              document_type
            ) values (
              ${businessA.id}::uuid,
              ${userB.id}::uuid,
              'Spoofed document',
              'text'
            )
          `,
        );

        const updated = await scoped`
          update public.knowledge_documents
          set name = 'Updated RLS document',
              status = 'archived',
              metadata = '{"updated":true}'::jsonb,
              updated_at = now()
          where id = ${documentA.id}::uuid
          returning id
        `;
        assert.equal(updated.length, 1, "owner A may update document A");

        await expectNoRows("owner A updates document B", () =>
          scoped`
            update public.knowledge_documents
            set name = 'Cross-tenant update'
            where id = ${documentB.id}::uuid
            returning id
          `,
        );
        await expectDenied(transaction, "owner A reparents document", () =>
          scoped`
            update public.knowledge_documents
            set business_id = ${businessB.id}::uuid
            where id = ${documentA.id}::uuid
          `,
        );
        await expectDenied(transaction, "owner A changes created_by", () =>
          scoped`
            update public.knowledge_documents
            set created_by_profile_id = ${userB.id}::uuid
            where id = ${documentA.id}::uuid
          `,
        );
        await expectDenied(transaction, "owner A deletes document", () =>
          scoped`
            delete from public.knowledge_documents
            where id = ${documentA.id}::uuid
          `,
        );

        await expectDenied(transaction, "owner A inserts chunk", () =>
          scoped`
            insert into public.document_chunks (
              business_id,
              document_id,
              chunk_index,
              content,
              metadata
            ) values (
              ${businessA.id}::uuid,
              ${documentA.id}::uuid,
              99,
              'Direct client chunk',
              '{}'::jsonb
            )
          `,
        );
        await expectDenied(transaction, "owner A inserts mismatched chunk", () =>
          scoped`
            insert into public.document_chunks (
              business_id,
              document_id,
              chunk_index,
              content
            ) values (
              ${businessA.id}::uuid,
              ${documentB.id}::uuid,
              100,
              'Mismatched parent chunk'
            )
          `,
        );
        await expectDenied(transaction, "owner A tampers with chunk fields", () =>
          scoped`
            update public.document_chunks
            set business_id = ${businessB.id}::uuid,
                document_id = ${documentB.id}::uuid,
                chunk_index = 99,
                content = 'tampered content',
                metadata = '{"tampered":true}'::jsonb,
                embedding_model = 'tampered-model'
            where id = ${chunkA.id}::uuid
          `,
        );
        await expectDenied(transaction, "owner A deletes chunk", () =>
          scoped`delete from public.document_chunks where id = ${chunkA.id}::uuid`,
        );
      });

      await asAuthenticatedUser(transaction, adminA.id, async (scoped) => {
        const created = await scoped`
          insert into public.knowledge_documents (
            business_id,
            created_by_profile_id,
            name,
            document_type
          ) values (
            ${businessA.id}::uuid,
            ${adminA.id}::uuid,
            'Temporary admin document',
            'text'
          )
          returning id, created_by_profile_id
        `;

        assert.equal(created.length, 1, "admin A may create document A");
        assert.equal(created[0].created_by_profile_id, adminA.id);

        const updated = await scoped`
          update public.knowledge_documents
          set name = 'Admin updated document', updated_at = now()
          where id = ${documentA.id}::uuid
          returning id
        `;

        assert.equal(updated.length, 1, "admin A may update document A");
      });

      await asAuthenticatedUser(transaction, memberA.id, async (scoped) => {
        const visibleDocumentA = await scoped`
          select id::text
          from public.knowledge_documents
          where id = ${documentA.id}::uuid
        `;
        const visibleChunkA = await scoped`
          select id::text
          from public.document_chunks
          where id = ${chunkA.id}::uuid
        `;
        assert.equal(visibleDocumentA.length, 1, "member A may read document A");
        assert.equal(visibleChunkA.length, 1, "member A may read chunk A");

        await expectDenied(transaction, "member A creates document", () =>
          scoped`
            insert into public.knowledge_documents (
              business_id,
              created_by_profile_id,
              name,
              document_type
            ) values (
              ${businessA.id}::uuid,
              ${memberA.id}::uuid,
              'Member document',
              'text'
            )
          `,
        );
        await expectNoRows("member A updates document", () =>
          scoped`
            update public.knowledge_documents
            set name = 'Member update'
            where id = ${documentA.id}::uuid
            returning id
          `,
        );
      });

      await asAuthenticatedUser(transaction, userB.id, async (scoped) => {
        const visibleDocumentB = await scoped`
          select id::text
          from public.knowledge_documents
          where id = ${documentB.id}::uuid
        `;
        const hiddenDocumentA = await scoped`
          select id::text
          from public.knowledge_documents
          where id = ${documentA.id}::uuid
        `;
        const visibleChunkB = await scoped`
          select id::text
          from public.document_chunks
          where id = ${chunkB.id}::uuid
        `;
        const hiddenChunkA = await scoped`
          select id::text
          from public.document_chunks
          where id = ${chunkA.id}::uuid
        `;

        assert.equal(visibleDocumentB.length, 1, "B may read document B");
        assert.equal(hiddenDocumentA.length, 0, "B may not read document A");
        assert.equal(visibleChunkB.length, 1, "B may read chunk B");
        assert.equal(hiddenChunkA.length, 0, "B may not read chunk A");
      });

      await asAuthenticatedUser(transaction, userC.id, async (scoped) => {
        const documents = await scoped`select id from public.knowledge_documents`;
        const chunks = await scoped`select id from public.document_chunks`;
        assert.equal(documents.length, 0, "C may not read documents");
        assert.equal(chunks.length, 0, "C may not read chunks");

        await expectDenied(transaction, "C creates document", () =>
          scoped`
            insert into public.knowledge_documents (
              business_id,
              created_by_profile_id,
              name,
              document_type
            ) values (
              ${businessA.id}::uuid,
              ${userC.id}::uuid,
              'Non-member document',
              'text'
            )
          `,
        );
        await expectDenied(transaction, "C inserts chunk", () =>
          scoped`
            insert into public.document_chunks (
              business_id,
              document_id,
              chunk_index,
              content
            ) values (
              ${businessA.id}::uuid,
              ${documentA.id}::uuid,
              98,
              'Non-member chunk'
            )
          `,
        );
      });

      await asAnonymous(transaction, async (scoped) => {
        await expectDenied(transaction, "anonymous document SELECT", () =>
          scoped`select id from public.knowledge_documents`,
        );
        await expectDenied(transaction, "anonymous chunk SELECT", () =>
          scoped`select id from public.document_chunks`,
        );
        await expectDenied(transaction, "anonymous document INSERT", () =>
          scoped`
            insert into public.knowledge_documents (
              business_id,
              name,
              document_type
            ) values (
              ${businessA.id}::uuid,
              'Anonymous document',
              'text'
            )
          `,
        );
        await expectDenied(transaction, "anonymous chunk INSERT", () =>
          scoped`
            insert into public.document_chunks (
              business_id,
              document_id,
              chunk_index,
              content
            ) values (
              ${businessA.id}::uuid,
              ${documentA.id}::uuid,
              97,
              'Anonymous chunk'
            )
          `,
        );
      });

      result = {
        documentReads: "owner/member A and member B tenant reads passed",
        documentWrites: "owner/admin boundary, cross-tenant creation, updates, reassignment, and delete checks passed",
        createdByProtection: "spoofing denied; authenticated creator required",
        chunkReads: "member-scoped UUID reads passed",
        chunkWrites: "insert/update/delete denied",
        embeddingProtection: "embedding-related chunk mutation denied",
        compositeMismatch: "cross-business document/chunk mismatch denied",
        anonymous: "document and chunk access denied",
      };

      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) {
      throw error;
    }
  }

  console.log(
    "Knowledge document/chunk RLS tests passed in a rollback-only transaction.",
  );
  console.log(JSON.stringify(result, null, 2));
  console.log("No Auth users or knowledge rows were persisted.");
}

try {
  await runTests();
} catch (error) {
  console.error("Knowledge document/chunk RLS tests failed.");
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
