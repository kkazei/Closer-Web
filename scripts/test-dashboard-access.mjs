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

const { withAuthenticatedDb } = await import("../src/db/index.ts");
const { getLeadByBusinessId, getLeadOverviewByBusinessId, listLeadsByBusinessId } =
  await import("../src/data/leads.ts");
const { getChatSessionByBusinessId, listChatSessionsByBusinessId } =
  await import("../src/data/chat-sessions.ts");
const {
  getKnowledgeDocumentByBusinessId,
  listKnowledgeDocumentsByBusinessId,
} = await import("../src/data/knowledge-documents.ts");
const { listBusinessesForProfileId } = await import("../src/data/businesses.ts");

const direct = postgres(process.env.DIRECT_URL, {
  max: 1,
  prepare: false,
});

const users = [
  { id: randomUUID(), email: `closer-dashboard-owner-${randomUUID()}@example.invalid` },
  { id: randomUUID(), email: `closer-dashboard-member-${randomUUID()}@example.invalid` },
  { id: randomUUID(), email: `closer-dashboard-outsider-${randomUUID()}@example.invalid` },
];

async function insertFixtureUsers() {
  return direct.begin(async (transaction) => {
    for (const user of users) {
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

      await transaction`
        insert into public.profiles (id, full_name)
        values (${user.id}::uuid, ${user.email})
      `;
    }

    const [businessA, businessB] = await transaction`
      select id::text, slug
      from public.businesses
      order by slug
      limit 2
    `;

    assert.ok(businessA?.id && businessB?.id, "two seeded businesses are required");

    await transaction`
      insert into public.business_memberships (business_id, profile_id, role)
      values
        (${businessA.id}::uuid, ${users[0].id}::uuid, 'owner'),
        (${businessB.id}::uuid, ${users[1].id}::uuid, 'member')
    `;

    const [leadA] = await transaction`
      select id::text
      from public.leads
      where business_id = ${businessA.id}::uuid
      order by created_at, id
      limit 1
    `;
    const [leadB] = await transaction`
      select id::text
      from public.leads
      where business_id = ${businessB.id}::uuid
      order by created_at, id
      limit 1
    `;
    const [sessionA] = await transaction`
      select id::text
      from public.chat_sessions
      where business_id = ${businessA.id}::uuid
      order by created_at, id
      limit 1
    `;
    const [sessionB] = await transaction`
      select id::text
      from public.chat_sessions
      where business_id = ${businessB.id}::uuid
      order by created_at, id
      limit 1
    `;
    const [documentA] = await transaction`
      select id::text
      from public.knowledge_documents
      where business_id = ${businessA.id}::uuid
      order by created_at, id
      limit 1
    `;
    const [documentB] = await transaction`
      select id::text
      from public.knowledge_documents
      where business_id = ${businessB.id}::uuid
      order by created_at, id
      limit 1
    `;

    for (const [label, fixture] of Object.entries({
      leadA,
      leadB,
      sessionA,
      sessionB,
      documentA,
      documentB,
    })) {
      assert.ok(fixture?.id, `seeded ${label} is required`);
    }

    return {
      businessA,
      businessB,
      leadA,
      leadB,
      sessionA,
      sessionB,
      documentA,
      documentB,
    };
  });
}

async function runTests() {
  const fixtures = await insertFixtureUsers();

  try {
    const ownerA = await withAuthenticatedDb(
      { userId: users[0].id },
      async () => {
        const businesses = await listBusinessesForProfileId(users[0].id);
        const leadsA = await listLeadsByBusinessId(fixtures.businessA.id);
        const leadsB = await listLeadsByBusinessId(fixtures.businessB.id);
        const overviewB = await getLeadOverviewByBusinessId(fixtures.businessB.id);
        const hiddenLead = await getLeadByBusinessId(
          fixtures.businessB.id,
          fixtures.leadB.id,
        );
        const sessionsA = await listChatSessionsByBusinessId(fixtures.businessA.id);
        const sessionsB = await listChatSessionsByBusinessId(fixtures.businessB.id);
        const hiddenSession = await getChatSessionByBusinessId(
          fixtures.businessB.id,
          fixtures.sessionB.id,
        );
        const documentsA = await listKnowledgeDocumentsByBusinessId(
          fixtures.businessA.id,
        );
        const documentsB = await listKnowledgeDocumentsByBusinessId(
          fixtures.businessB.id,
        );
        const hiddenDocument = await getKnowledgeDocumentByBusinessId(
          fixtures.businessB.id,
          fixtures.documentB.id,
        );

        return {
          businesses,
          leadsA,
          leadsB,
          overviewB,
          hiddenLead,
          sessionsA,
          sessionsB,
          hiddenSession,
          documentsA,
          documentsB,
          hiddenDocument,
        };
      },
    );

    assert.deepEqual(
      ownerA.businesses.map(({ id }) => id),
      [fixtures.businessA.id],
      "owner A receives only business A",
    );
    assert.ok(ownerA.leadsA.length > 0, "owner A sees business A leads");
    assert.equal(ownerA.leadsB.length, 0, "owner A sees no business B leads");
    assert.deepEqual(ownerA.overviewB, {
      total: 0,
      newLeads: 0,
      qualified: 0,
      highQuality: 0,
      averageScore: 0,
    });
    assert.equal(ownerA.hiddenLead, null, "foreign lead detail is hidden");
    assert.ok(ownerA.sessionsA.length > 0, "owner A sees business A sessions");
    assert.equal(ownerA.sessionsB.length, 0, "owner A sees no business B sessions");
    assert.equal(ownerA.hiddenSession, null, "foreign session detail is hidden");
    assert.ok(ownerA.documentsA.length > 0, "owner A sees business A documents");
    assert.equal(ownerA.documentsB.length, 0, "owner A sees no business B documents");
    assert.equal(ownerA.hiddenDocument, null, "foreign document detail is hidden");

    const memberB = await withAuthenticatedDb(
      { userId: users[1].id },
      () => listBusinessesForProfileId(users[1].id),
    );
    assert.deepEqual(
      memberB.map(({ id }) => id),
      [fixtures.businessB.id],
      "member B receives only business B",
    );

    const outsider = await withAuthenticatedDb(
      { userId: users[2].id },
      async () => ({
        businesses: await listBusinessesForProfileId(users[2].id),
        leads: await listLeadsByBusinessId(fixtures.businessA.id),
        sessions: await listChatSessionsByBusinessId(fixtures.businessA.id),
        documents: await listKnowledgeDocumentsByBusinessId(fixtures.businessA.id),
      }),
    );
    assert.equal(outsider.businesses.length, 0, "non-member receives no businesses");
    assert.equal(outsider.leads.length, 0, "non-member receives no leads");
    assert.equal(outsider.sessions.length, 0, "non-member receives no sessions");
    assert.equal(outsider.documents.length, 0, "non-member receives no documents");

    console.log("Dashboard tenant access tests passed.");
    console.log(
      JSON.stringify(
        {
          ownerA: "business A only; business B rows hidden",
          memberB: "business B only",
          outsider: "no businesses or private dashboard rows",
        },
        null,
        2,
      ),
    );
  } finally {
    for (const user of users) {
      await direct`
        delete from public.profiles
        where id = ${user.id}::uuid
      `;
      await direct`
        delete from auth.users
        where id = ${user.id}::uuid
      `;
    }
  }
}

try {
  await runTests();
} catch (error) {
  console.error("Dashboard tenant access tests failed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await direct.end({ timeout: 5 });
}

// withAuthenticatedDb owns the application pool, so a standalone test runner
// must terminate after cleanup rather than waiting on the idle pool.
process.exit(process.exitCode ?? 0);
