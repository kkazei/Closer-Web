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
  // This is the same transaction-local role/claim context established by
  // withAuthenticatedDb. The trusted direct role is used only to install
  // rollback-only fixtures, never as the requester under test.
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
  const savepoint = `closer_lead_session_message_denied_${savepointNumber++}`;

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

      const leadRows = await transaction`
        select distinct on (business_id) id::text, business_id::text
        from public.leads
        where business_id in (${businessA.id}::uuid, ${businessB.id}::uuid)
        order by business_id, id
      `;
      const sessionRows = await transaction`
        select distinct on (business_id)
          id::text,
          business_id::text,
          visitor_id::text,
          lead_id::text
        from public.chat_sessions
        where business_id in (${businessA.id}::uuid, ${businessB.id}::uuid)
        order by business_id, id
      `;
      const messageRows = await transaction`
        select distinct on (business_id)
          id::text,
          business_id::text,
          session_id::text
        from public.messages
        where business_id in (${businessA.id}::uuid, ${businessB.id}::uuid)
        order by business_id, session_id, id
      `;

      const leadA = leadRows.find((row) => row.business_id === businessA.id);
      const leadB = leadRows.find((row) => row.business_id === businessB.id);
      const sessionA = sessionRows.find(
        (row) => row.business_id === businessA.id,
      );
      const sessionB = sessionRows.find(
        (row) => row.business_id === businessB.id,
      );
      const messageA = messageRows.find(
        (row) => row.business_id === businessA.id,
      );
      const messageB = messageRows.find(
        (row) => row.business_id === businessB.id,
      );

      assert.equal(leadA.business_id, businessA.id);
      assert.equal(leadB.business_id, businessB.id);
      assert.equal(sessionA.business_id, businessA.id);
      assert.equal(sessionB.business_id, businessB.id);
      assert.equal(messageA.business_id, businessA.id);
      assert.equal(messageB.business_id, businessB.id);

      const userA = fixtureUser("closer-r-l-s-user-a");
      const userB = fixtureUser("closer-r-l-s-user-b");
      const userC = fixtureUser("closer-r-l-s-user-c");

      for (const user of [userA, userB, userC]) {
        await insertAuthUser(transaction, user);
        await transaction`
          insert into public.profiles (id, full_name)
          values (${user.id}::uuid, ${user.email})
        `;
      }

      await transaction`
        insert into public.business_memberships (business_id, profile_id, role)
        values
          (${businessA.id}::uuid, ${userA.id}::uuid, 'member'),
          (${businessB.id}::uuid, ${userB.id}::uuid, 'member')
      `;

      let createdLeadId;
      let createdSessionId;

      await asAuthenticatedUser(transaction, userA.id, async (scoped) => {
        const visibleLeadA = await scoped`
          select id::text
          from public.leads
          where id = ${leadA.id}::uuid
        `;
        const hiddenLeadB = await scoped`
          select id::text
          from public.leads
          where id = ${leadB.id}::uuid
        `;
        assert.equal(visibleLeadA.length, 1, "A may read an A lead");
        assert.equal(hiddenLeadB.length, 0, "A may not read a B lead");

        const visibleSessionA = await scoped`
          select id::text
          from public.chat_sessions
          where id = ${sessionA.id}::uuid
        `;
        const hiddenSessionB = await scoped`
          select id::text
          from public.chat_sessions
          where id = ${sessionB.id}::uuid
        `;
        assert.equal(visibleSessionA.length, 1, "A may read an A session");
        assert.equal(hiddenSessionB.length, 0, "A may not read a B session");

        const visibleMessageA = await scoped`
          select id::text
          from public.messages
          where id = ${messageA.id}::uuid
        `;
        const hiddenMessageB = await scoped`
          select id::text
          from public.messages
          where id = ${messageB.id}::uuid
        `;
        assert.equal(visibleMessageA.length, 1, "A may read an A message");
        assert.equal(hiddenMessageB.length, 0, "A may not read a B message");

        const visitorLookup = await scoped`
          select id::text
          from public.chat_sessions
          where id = ${sessionB.id}::uuid
            and visitor_id = ${sessionB.visitor_id}::uuid
        `;
        assert.equal(
          visitorLookup.length,
          0,
          "visitor_id must not authorize a cross-tenant session lookup",
        );

        const createdLead = await scoped`
          insert into public.leads (
            business_id,
            name,
            company,
            role,
            use_case,
            timeline
          ) values (
            ${businessA.id}::uuid,
            'Temporary RLS Lead',
            'Closer Test Co',
            'Buyer',
            'RLS verification',
            'This quarter'
          )
          returning id::text, business_id::text, score, score_breakdown
        `;

        assert.equal(createdLead.length, 1, "A may create a lead in A");
        assert.equal(createdLead[0].business_id, businessA.id);
        assert.equal(createdLead[0].score, null);
        assert.deepEqual(createdLead[0].score_breakdown, {});
        createdLeadId = createdLead[0].id;

        await expectDenied(transaction, "A creates a lead in B", () =>
          scoped`
            insert into public.leads (business_id, name)
            values (${businessB.id}::uuid, 'Cross-tenant lead')
          `,
        );

        const ordinaryLeadUpdate = await scoped`
          update public.leads
          set name = 'Updated temporary RLS lead', updated_at = now()
          where id = ${leadA.id}::uuid
          returning id
        `;
        assert.equal(
          ordinaryLeadUpdate.length,
          1,
          "A may update ordinary lead fields in A",
        );

        await expectDenied(transaction, "A tampers with lead score fields", () =>
          scoped`
            update public.leads
            set score = 99,
                score_breakdown = '{"tampered":true}'::jsonb,
                score_explanation = 'tampered'
            where id = ${leadA.id}::uuid
          `,
        );
        await expectDenied(transaction, "A reparents a lead", () =>
          scoped`
            update public.leads
            set business_id = ${businessB.id}::uuid
            where id = ${leadA.id}::uuid
          `,
        );
        await expectDenied(transaction, "A deletes a lead", () =>
          scoped`delete from public.leads where id = ${leadA.id}::uuid`,
        );

        const createdChatSession = await scoped`
          insert into public.chat_sessions (
            business_id,
            lead_id,
            status
          ) values (
            ${businessA.id}::uuid,
            ${createdLeadId}::uuid,
            'active'
          )
          returning id::text, business_id::text, visitor_id::text
        `;

        assert.equal(createdChatSession.length, 1, "A may create an A session");
        assert.equal(createdChatSession[0].business_id, businessA.id);
        assert.ok(createdChatSession[0].visitor_id, "visitor_id is generated");
        createdSessionId = createdChatSession[0].id;

        await expectDenied(transaction, "A creates a session in B", () =>
          scoped`
            insert into public.chat_sessions (
              business_id,
              lead_id,
              status
            ) values (
              ${businessB.id}::uuid,
              ${leadB.id}::uuid,
              'active'
            )
          `,
        );
        await expectDenied(transaction, "A supplies visitor_id", () =>
          scoped`
            insert into public.chat_sessions (
              business_id,
              visitor_id
            ) values (
              ${businessA.id}::uuid,
              ${sessionB.visitor_id}::uuid
            )
          `,
        );

        const ordinarySessionUpdate = await scoped`
          update public.chat_sessions
          set status = 'completed', updated_at = now()
          where id = ${sessionA.id}::uuid
          returning id
        `;
        assert.equal(
          ordinarySessionUpdate.length,
          1,
          "A may update permitted session fields in A",
        );

        await expectDenied(transaction, "A reparents a session", () =>
          scoped`
            update public.chat_sessions
            set business_id = ${businessB.id}::uuid
            where id = ${sessionA.id}::uuid
          `,
        );
        await expectDenied(transaction, "A changes session visitor_id", () =>
          scoped`
            update public.chat_sessions
            set visitor_id = ${randomUUID()}::uuid
            where id = ${sessionA.id}::uuid
          `,
        );
        await expectDenied(transaction, "A attaches an A session to a B lead", () =>
          scoped`
            update public.chat_sessions
            set lead_id = ${leadB.id}::uuid
            where id = ${sessionA.id}::uuid
          `,
        );
        await expectDenied(transaction, "A deletes a session", () =>
          scoped`delete from public.chat_sessions where id = ${sessionA.id}::uuid`,
        );

        const createdMessage = await scoped`
          insert into public.messages (
            business_id,
            session_id,
            role,
            content
          ) values (
            ${businessA.id}::uuid,
            ${createdSessionId}::uuid,
            'user',
            'Temporary RLS message'
          )
          returning id::text, role::text
        `;

        assert.equal(createdMessage.length, 1, "A may insert a user message");
        assert.equal(createdMessage[0].role, "user");

        await expectDenied(transaction, "A inserts a message into B", () =>
          scoped`
            insert into public.messages (
              business_id,
              session_id,
              role,
              content
            ) values (
              ${businessB.id}::uuid,
              ${messageB.session_id}::uuid,
              'user',
              'Cross-tenant message'
            )
          `,
        );
        await expectDenied(transaction, "A mixes Business A with B session", () =>
          scoped`
            insert into public.messages (
              business_id,
              session_id,
              role,
              content
            ) values (
              ${businessA.id}::uuid,
              ${messageB.session_id}::uuid,
              'user',
              'Mismatched composite message'
            )
          `,
        );
        await expectDenied(transaction, "A inserts an assistant message", () =>
          scoped`
            insert into public.messages (
              business_id,
              session_id,
              role,
              content
            ) values (
              ${businessA.id}::uuid,
              ${createdSessionId}::uuid,
              'assistant',
              'Assistant must use a trusted path'
            )
          `,
        );
        await expectDenied(transaction, "A inserts a system message", () =>
          scoped`
            insert into public.messages (
              business_id,
              session_id,
              role,
              content
            ) values (
              ${businessA.id}::uuid,
              ${createdSessionId}::uuid,
              'system',
              'System must use a trusted path'
            )
          `,
        );
        await expectDenied(transaction, "A controls message metadata", () =>
          scoped`
            insert into public.messages (
              business_id,
              session_id,
              role,
              content,
              status,
              provider,
              model,
              input_tokens,
              output_tokens,
              total_tokens,
              metadata,
              error_code
            ) values (
              ${businessA.id}::uuid,
              ${createdSessionId}::uuid,
              'user',
              'Metadata must use a trusted path',
              'error',
              'client',
              'client-model',
              1,
              2,
              3,
              '{"tampered":true}'::jsonb,
              'client-error'
            )
          `,
        );
        await expectDenied(transaction, "A modifies a message", () =>
          scoped`
            update public.messages
            set content = 'tampered transcript'
            where id = ${messageA.id}::uuid
          `,
        );
        await expectDenied(transaction, "A deletes a message", () =>
          scoped`delete from public.messages where id = ${messageA.id}::uuid`,
        );
      });

      await asAuthenticatedUser(transaction, userB.id, async (scoped) => {
        const visibleLeadB = await scoped`
          select id::text from public.leads where id = ${leadB.id}::uuid
        `;
        const hiddenLeadA = await scoped`
          select id::text from public.leads where id = ${leadA.id}::uuid
        `;
        const visibleSessionB = await scoped`
          select id::text from public.chat_sessions where id = ${sessionB.id}::uuid
        `;
        const hiddenSessionA = await scoped`
          select id::text from public.chat_sessions where id = ${sessionA.id}::uuid
        `;
        const visibleMessageB = await scoped`
          select id::text from public.messages where id = ${messageB.id}::uuid
        `;
        const hiddenMessageA = await scoped`
          select id::text from public.messages where id = ${messageA.id}::uuid
        `;

        assert.equal(visibleLeadB.length, 1, "B may read a B lead");
        assert.equal(hiddenLeadA.length, 0, "B may not read an A lead");
        assert.equal(visibleSessionB.length, 1, "B may read a B session");
        assert.equal(hiddenSessionA.length, 0, "B may not read an A session");
        assert.equal(visibleMessageB.length, 1, "B may read a B message");
        assert.equal(hiddenMessageA.length, 0, "B may not read an A message");
      });

      await asAuthenticatedUser(transaction, userC.id, async (scoped) => {
        const leadRows = await scoped`
          select id::text from public.leads where id = ${leadA.id}::uuid
        `;
        const sessionRows = await scoped`
          select id::text from public.chat_sessions where id = ${sessionA.id}::uuid
        `;
        const messageRows = await scoped`
          select id::text from public.messages where id = ${messageA.id}::uuid
        `;

        assert.equal(leadRows.length, 0, "C may not read a lead");
        assert.equal(sessionRows.length, 0, "C may not read a session");
        assert.equal(messageRows.length, 0, "C may not read a message");

        await expectDenied(transaction, "C inserts a lead", () =>
          scoped`
            insert into public.leads (business_id, name)
            values (${businessA.id}::uuid, 'C must be denied')
          `,
        );
        await expectDenied(transaction, "C inserts a session", () =>
          scoped`
            insert into public.chat_sessions (business_id)
            values (${businessA.id}::uuid)
          `,
        );
        await expectDenied(transaction, "C inserts a message", () =>
          scoped`
            insert into public.messages (
              business_id,
              session_id,
              role,
              content
            ) values (
              ${businessA.id}::uuid,
              ${sessionA.id}::uuid,
              'user',
              'C must be denied'
            )
          `,
        );
      });

      await asAnonymous(transaction, async (scoped) => {
        await expectDenied(transaction, "anonymous lead SELECT", () =>
          scoped`select id from public.leads`,
        );
        await expectDenied(transaction, "anonymous session SELECT", () =>
          scoped`select id from public.chat_sessions`,
        );
        await expectDenied(transaction, "anonymous message SELECT", () =>
          scoped`select id from public.messages`,
        );
        await expectDenied(transaction, "anonymous lead INSERT", () =>
          scoped`
            insert into public.leads (business_id, name)
            values (${businessA.id}::uuid, 'anonymous')
          `,
        );
        await expectDenied(transaction, "anonymous session INSERT", () =>
          scoped`
            insert into public.chat_sessions (business_id)
            values (${businessA.id}::uuid)
          `,
        );
        await expectDenied(transaction, "anonymous message INSERT", () =>
          scoped`
            insert into public.messages (
              business_id,
              session_id,
              role,
              content
            ) values (
              ${businessA.id}::uuid,
              ${sessionA.id}::uuid,
              'user',
              'anonymous'
            )
          `,
        );
      });

      result = {
        leadReads: "A/B tenant reads allowed; cross-tenant and C denied",
        leadWrites: "A-in-A allowed; A-in-B, reparent, score tampering, and delete denied",
        sessionReads: "A/B tenant reads allowed; cross-tenant and visitor lookup denied",
        sessionWrites: "A-in-A allowed; cross-tenant, visitor mutation, mismatch, and delete denied",
        messageReads: "A/B tenant reads allowed; cross-tenant and C denied",
        messageWrites: "user-in-tenant allowed; assistant/system, metadata, mismatch, update, and delete denied",
        anonymous: "all tested reads and writes denied",
      };

      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) {
      throw error;
    }
  }

  console.log(
    "Leads/chat sessions/messages RLS tests passed in a rollback-only transaction.",
  );
  console.log(JSON.stringify(result, null, 2));
  console.log("No Auth users or tenant rows were persisted.");
}

try {
  await runTests();
} catch (error) {
  console.error("Leads/chat sessions/messages RLS tests failed.");
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
