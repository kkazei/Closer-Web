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

// Import the real TASK-RLS-001 request-scoped context. The loader resolves the
// repository's extensionless TypeScript imports for Node's type stripping.
const { withAuthenticatedDb } = await import("../src/db/index.ts");
const { getBusinessById } = await import("../src/data/businesses.ts");
const { sql } = await import("drizzle-orm");

const direct = postgres(process.env.DIRECT_URL, {
  max: 1,
  prepare: false,
});

const fixtures = {
  users: {},
  created: {
    leads: [],
    sessions: [],
    messages: [],
    documents: [],
  },
};

const anonymousDenied = Symbol("anonymous-denied");

function fixtureUser(name) {
  const id = randomUUID();

  return { name, id, email: `${name}-${id}@example.invalid` };
}

function rememberUser(name) {
  const user = fixtureUser(name);
  fixtures.users[name] = user;
  return user;
}

async function setupFixtures() {
  const [businessA, businessB] = await direct`
    select id::text, slug
    from public.businesses
    order by slug
  `;
  const documentRows = await direct`
    select distinct on (business_id)
      id::text,
      business_id::text
    from public.knowledge_documents
    order by business_id, id
  `;
  const chunkRows = await direct`
    select distinct on (business_id)
      id::text,
      business_id::text,
      document_id::text
    from public.document_chunks
    order by business_id, document_id, chunk_index
  `;
  const leadRows = await direct`
    select distinct on (business_id)
      id::text,
      business_id::text
    from public.leads
    order by business_id, id
  `;
  const sessionRows = await direct`
    select distinct on (business_id)
      id::text,
      business_id::text,
      visitor_id::text
    from public.chat_sessions
    order by business_id, id
  `;
  const messageRows = await direct`
    select distinct on (business_id)
      id::text,
      business_id::text,
      session_id::text
    from public.messages
    order by business_id, session_id, id
  `;

  assert.ok(businessA?.id && businessB?.id, "two seeded businesses are required");

  fixtures.businessA = businessA;
  fixtures.businessB = businessB;
  fixtures.documentA = documentRows.find(
    (row) => row.business_id === businessA.id,
  );
  fixtures.documentB = documentRows.find(
    (row) => row.business_id === businessB.id,
  );
  fixtures.chunkA = chunkRows.find((row) => row.business_id === businessA.id);
  fixtures.chunkB = chunkRows.find((row) => row.business_id === businessB.id);
  fixtures.leadA = leadRows.find((row) => row.business_id === businessA.id);
  fixtures.leadB = leadRows.find((row) => row.business_id === businessB.id);
  fixtures.sessionA = sessionRows.find(
    (row) => row.business_id === businessA.id,
  );
  fixtures.sessionB = sessionRows.find(
    (row) => row.business_id === businessB.id,
  );
  fixtures.messageA = messageRows.find(
    (row) => row.business_id === businessA.id,
  );
  fixtures.messageB = messageRows.find(
    (row) => row.business_id === businessB.id,
  );

  for (const key of [
    "documentA",
    "documentB",
    "chunkA",
    "chunkB",
    "leadA",
    "leadB",
    "sessionA",
    "sessionB",
    "messageA",
    "messageB",
  ]) {
    assert.ok(fixtures[key]?.id, `seeded ${key} is required`);
  }

  const ownerA = rememberUser("ownerA");
  const adminA = rememberUser("adminA");
  const memberA = rememberUser("memberA");
  const ownerB = rememberUser("ownerB");
  const userC = rememberUser("userC");
  const profileOnly = rememberUser("profileOnly");

  await direct.begin(async (transaction) => {
    for (const user of Object.values(fixtures.users)) {
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

    for (const user of [ownerA, adminA, memberA, ownerB, userC]) {
      await transaction`
        insert into public.profiles (id, full_name)
        values (${user.id}::uuid, ${user.name})
      `;
    }

    await transaction`
      insert into public.business_memberships (business_id, profile_id, role)
      values
        (${businessA.id}::uuid, ${ownerA.id}::uuid, 'owner'),
        (${businessA.id}::uuid, ${adminA.id}::uuid, 'admin'),
        (${businessA.id}::uuid, ${memberA.id}::uuid, 'member'),
        (${businessB.id}::uuid, ${ownerB.id}::uuid, 'owner')
    `;
  });

  void profileOnly;
}

async function cleanupFixtures() {
  await direct.begin(async (transaction) => {
    for (const id of fixtures.created.messages) {
      await transaction`delete from public.messages where id = ${id}::uuid`;
    }
    for (const id of fixtures.created.sessions) {
      await transaction`delete from public.chat_sessions where id = ${id}::uuid`;
    }
    for (const id of fixtures.created.documents) {
      await transaction`
        delete from public.knowledge_documents where id = ${id}::uuid
      `;
    }
    for (const id of fixtures.created.leads) {
      await transaction`delete from public.leads where id = ${id}::uuid`;
    }
    for (const user of Object.values(fixtures.users)) {
      await transaction`
        delete from public.business_memberships where profile_id = ${user.id}::uuid
      `;
      await transaction`delete from public.profiles where id = ${user.id}::uuid`;
      await transaction`delete from auth.users where id = ${user.id}::uuid`;
    }
  });
}

async function asUser(user, callback) {
  return withAuthenticatedDb({ userId: user.id }, callback);
}

async function userRows(user, statement) {
  const rows = await asUser(user, (database) => database.execute(statement));
  return Array.from(rows);
}

async function userWrite(user, statement) {
  return userRows(user, statement);
}

async function expectDenied(label, user, statement) {
  try {
    await userWrite(user, statement);
  } catch {
    return;
  }

  throw new Error(`${label} was not denied.`);
}

async function expectNoRows(label, user, statement) {
  const rows = await userRows(user, statement);
  assert.equal(rows.length, 0, `${label} was not denied by RLS.`);
}

async function expectAnonymousDenied(label, statement) {
  try {
    await direct.begin(async (transaction) => {
      await transaction.unsafe("set local role anon");
      try {
        await statement(transaction);
      } catch {
        throw anonymousDenied;
      }
      throw new Error(`${label} was not denied.`);
    });
  } catch (error) {
    if (error === anonymousDenied) {
      return;
    }
    throw error;
  }
}

async function inventory() {
  const protectedTables = [
    "businesses",
    "profiles",
    "business_memberships",
    "leads",
    "chat_sessions",
    "messages",
    "knowledge_documents",
    "document_chunks",
  ];
  const tablesSql = protectedTables.map((table) => `'${table}'`).join(",");
  const rls = await direct.unsafe(`
    select c.relname as table_name,
      c.relrowsecurity as rls_enabled,
      c.relforcerowsecurity as force_rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in (${tablesSql})
    order by c.relname
  `);
  const policies = await direct.unsafe(`
    select schemaname, tablename, policyname, cmd, roles, qual, with_check
    from pg_policies
    where schemaname = 'public'
    order by tablename, policyname
  `);
  const grants = await direct.unsafe(`
    select role_name, table_name,
      has_table_privilege(role_name, format('public.%s', table_name), 'SELECT') as can_select,
      has_table_privilege(role_name, format('public.%s', table_name), 'INSERT') as table_insert,
      has_table_privilege(role_name, format('public.%s', table_name), 'UPDATE') as table_update,
      has_table_privilege(role_name, format('public.%s', table_name), 'DELETE') as can_delete
    from (values
      ('anon'::name),
      ('authenticated'::name),
      ('service_role'::name),
      ('postgres'::name)
    ) as roles(role_name)
    cross join (values ${protectedTables
      .map((table) => `('${table}'::text)`)
      .join(",")}) as tables(table_name)
    order by table_name, role_name
  `);
  const roles = await direct.unsafe(`
    select rolname, rolbypassrls
    from pg_roles
    where rolname in ('anon', 'authenticated', 'service_role', 'postgres')
    order by rolname
  `);
  const trigger = await direct.unsafe(`
    select e.evtname, e.evtenabled, p.proname,
      md5(pg_get_functiondef(p.oid)) as function_definition_hash
    from pg_event_trigger e
    join pg_proc p on p.oid = e.evtfoid
    where e.evtname = 'ensure_rls'
  `);
  const functions = await direct.unsafe(`
    select n.nspname as schema_name,
      p.proname,
      pg_get_function_identity_arguments(p.oid) as arguments,
      p.prosecdef as security_definer,
      pg_get_userbyid(p.proowner) as owner,
      p.proconfig,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
      md5(pg_get_functiondef(p.oid)) as definition_hash
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'private' and p.proname in ('is_business_member', 'has_business_role'))
      or (n.nspname = 'public' and p.proname = 'rls_auto_enable')
    order by schema_name, p.proname
  `);
  const foreignKeys = await direct.unsafe(`
    select conname,
      conrelid::regclass::text as child_table,
      confrelid::regclass::text as parent_table,
      pg_get_constraintdef(oid) as definition
    from pg_constraint
    where contype = 'f'
      and conrelid in (
        'public.businesses'::regclass,
        'public.profiles'::regclass,
        'public.business_memberships'::regclass,
        'public.leads'::regclass,
        'public.chat_sessions'::regclass,
        'public.messages'::regclass,
        'public.knowledge_documents'::regclass,
        'public.document_chunks'::regclass
      )
    order by child_table, conname
  `);
  const migrations = await direct.unsafe(`
    select id, hash, created_at
    from drizzle.__drizzle_migrations
    order by id
  `);
  const schemaPrivileges = await direct.unsafe(`
    select
      has_schema_privilege('authenticated', 'private', 'USAGE') as authenticated_schema_usage,
      has_schema_privilege('anon', 'private', 'USAGE') as anon_schema_usage,
      has_function_privilege(
        'authenticated',
        'private.is_business_member(uuid)',
        'EXECUTE'
      ) as authenticated_member_execute,
      has_function_privilege(
        'anon',
        'private.is_business_member(uuid)',
        'EXECUTE'
      ) as anon_member_execute
  `);

  assert.equal(rls.length, protectedTables.length);
  assert.ok(rls.every((table) => table.rls_enabled));
  assert.ok(rls.every((table) => !table.force_rls));
  assert.ok(
    policies.every(
      (policy) => !policy.roles.some((role) => role === "anon"),
    ),
  );
  assert.equal(trigger.length, 1);
  assert.equal(trigger[0].proname, "rls_auto_enable");
  assert.equal(functions.length, 3);
  assert.ok(
    functions
      .filter((fn) => fn.schema_name === "private")
      .every(
        (fn) =>
          fn.security_definer &&
          fn.owner === "postgres" &&
          fn.proconfig?.includes("search_path=pg_catalog") &&
          !fn.anon_execute &&
          fn.authenticated_execute,
      ),
  );
  assert.equal(foreignKeys.length, 12);
  assert.deepEqual(
    migrations.map((migration) => migration.id),
    [1, 2, 3, 4, 5, 6],
  );
  assert.equal(schemaPrivileges[0].authenticated_schema_usage, true);
  assert.equal(schemaPrivileges[0].anon_schema_usage, false);
  assert.equal(schemaPrivileges[0].authenticated_member_execute, true);
  assert.equal(schemaPrivileges[0].anon_member_execute, false);

  return {
    rls,
    policies,
    grants,
    roles,
    trigger,
    functions,
    foreignKeys,
    migrations,
    schemaPrivileges,
  };
}

async function runSecurityTests() {
  const {
    businessA,
    businessB,
    ownerA,
    adminA,
    memberA,
    ownerB,
    userC,
    profileOnly,
  } = {
    businessA: fixtures.businessA,
    businessB: fixtures.businessB,
    ownerA: fixtures.users.ownerA,
    adminA: fixtures.users.adminA,
    memberA: fixtures.users.memberA,
    ownerB: fixtures.users.ownerB,
    userC: fixtures.users.userC,
    profileOnly: fixtures.users.profileOnly,
  };
  const { documentA, documentB, chunkA, chunkB, leadA, leadB, sessionA, sessionB, messageA, messageB } = fixtures;

  // Business and profile matrix.
  for (const user of [ownerA, adminA, memberA]) {
    assert.equal(
      (await userRows(user, sql`select id from public.businesses where id = ${businessA.id}::uuid`)).length,
      1,
    );
    assert.equal(
      (await userRows(user, sql`select id from public.businesses where id = ${businessB.id}::uuid`)).length,
      0,
    );
  }
  assert.equal(
    (await userRows(ownerB, sql`select id from public.businesses where id = ${businessB.id}::uuid`)).length,
    1,
  );
  assert.equal(
    (await userRows(ownerB, sql`select id from public.businesses where id = ${businessA.id}::uuid`)).length,
    0,
  );
  assert.equal(
    (await userRows(userC, sql`select id from public.businesses`)).length,
    0,
  );

  const dalBusinessA = await withAuthenticatedDb(
    { userId: ownerA.id },
    () => getBusinessById(businessA.id),
  );
  const dalBusinessB = await withAuthenticatedDb(
    { userId: ownerA.id },
    () => getBusinessById(businessB.id),
  );
  assert.equal(dalBusinessA?.id, businessA.id);
  assert.equal(dalBusinessB, null);

  const updatedBusiness = await userWrite(
    ownerA,
    sql`update public.businesses set name = 'RLS owner update' where id = ${businessA.id}::uuid returning id`,
  );
  assert.equal(updatedBusiness.length, 1);
  const updatedByAdmin = await userWrite(
    adminA,
    sql`update public.businesses set name = 'RLS admin update' where id = ${businessA.id}::uuid returning id`,
  );
  assert.equal(updatedByAdmin.length, 1);
  await expectNoRows(
    "member business update",
    memberA,
    sql`update public.businesses set name = 'member update' where id = ${businessA.id}::uuid returning id`,
  );
  await expectNoRows(
    "cross-tenant business update",
    ownerA,
    sql`update public.businesses set name = 'cross-tenant' where id = ${businessB.id}::uuid returning id`,
  );
  await expectDenied(
    "business insert",
    ownerA,
    sql`insert into public.businesses (name, slug) values ('arbitrary', ${`arbitrary-${randomUUID()}`})`,
  );
  await expectDenied(
    "business delete",
    ownerA,
    sql`delete from public.businesses where id = ${businessA.id}::uuid`,
  );
  await expectDenied(
    "business tenant identity update",
    ownerA,
    sql`update public.businesses set id = ${randomUUID()}::uuid where id = ${businessA.id}::uuid`,
  );

  assert.equal(
    (await userRows(ownerA, sql`select id from public.profiles where id = ${ownerA.id}::uuid`)).length,
    1,
  );
  assert.equal(
    (await userRows(ownerA, sql`select id from public.profiles where id = ${ownerB.id}::uuid`)).length,
    0,
  );
  assert.equal(
    (await userRows(userC, sql`select id from public.profiles where id = ${ownerA.id}::uuid`)).length,
    0,
  );
  await expectDenied(
    "profile spoof insert",
    ownerA,
    sql`insert into public.profiles (id, full_name) values (${profileOnly.id}::uuid, 'spoofed')`,
  );
  const ownProfile = await userWrite(
    profileOnly,
    sql`insert into public.profiles (id, full_name) values (${profileOnly.id}::uuid, 'Profile only') returning id`,
  );
  assert.equal(ownProfile.length, 1);
  const profileUpdate = await userWrite(
    ownerA,
    sql`update public.profiles set full_name = 'Updated', avatar_url = 'https://example.invalid/avatar' where id = ${ownerA.id}::uuid returning id`,
  );
  assert.equal(profileUpdate.length, 1);
  await expectNoRows(
    "other profile update",
    ownerA,
    sql`update public.profiles set full_name = 'Spoofed' where id = ${ownerB.id}::uuid returning id`,
  );
  await expectDenied(
    "profile id update",
    ownerA,
    sql`update public.profiles set id = ${randomUUID()}::uuid where id = ${ownerA.id}::uuid`,
  );
  await expectDenied(
    "profile delete",
    ownerA,
    sql`delete from public.profiles where id = ${ownerA.id}::uuid`,
  );

  // Membership reads and privilege escalation.
  for (const user of [ownerA, adminA, memberA]) {
    assert.ok(
      (await userRows(user, sql`select business_id from public.business_memberships where business_id = ${businessA.id}::uuid`)).length > 0,
    );
    assert.equal(
      (await userRows(user, sql`select business_id from public.business_memberships where business_id = ${businessB.id}::uuid`)).length,
      0,
    );
  }
  assert.equal(
    (await userRows(userC, sql`select business_id from public.business_memberships`)).length,
    0,
  );
  for (const [label, user, role] of [
    ["member self-owner", memberA, "owner"],
    ["member self-admin", memberA, "admin"],
    ["member add self B", memberA, "member"],
    ["member add another owner", memberA, "owner"],
    ["member promote member", memberA, "admin"],
    ["member demote owner", memberA, "member"],
    ["admin grant ownership", adminA, "owner"],
    ["admin modify role", adminA, "admin"],
  ]) {
    const targetBusiness = label.includes("B") ? businessB.id : businessA.id;
    const targetProfile = label.includes("another") ? ownerB.id : memberA.id;
    await expectDenied(
      label,
      user,
      sql`update public.business_memberships set role = ${role}::membership_role where business_id = ${targetBusiness}::uuid and profile_id = ${targetProfile}::uuid`,
    );
  }
  await expectDenied(
    "member insert membership",
    memberA,
    sql`insert into public.business_memberships (business_id, profile_id, role) values (${businessB.id}::uuid, ${memberA.id}::uuid, 'owner')`,
  );
  await expectDenied(
    "member delete membership",
    memberA,
    sql`delete from public.business_memberships where business_id = ${businessA.id}::uuid and profile_id = ${ownerA.id}::uuid`,
  );

  // Leads.
  assert.equal((await userRows(ownerA, sql`select id from public.leads where id = ${leadA.id}::uuid`)).length, 1);
  assert.equal((await userRows(ownerA, sql`select id from public.leads where id = ${leadB.id}::uuid`)).length, 0);
  assert.equal((await userRows(ownerB, sql`select id from public.leads where id = ${leadB.id}::uuid`)).length, 1);
  assert.equal((await userRows(userC, sql`select id from public.leads`)).length, 0);
  const createdLead = await userWrite(
    ownerA,
    sql`insert into public.leads (business_id, name, company) values (${businessA.id}::uuid, 'Security lead', 'Test company') returning id`,
  );
  assert.equal(createdLead.length, 1);
  fixtures.created.leads.push(createdLead[0].id);
  await expectDenied(
    "cross-tenant lead insert",
    ownerA,
    sql`insert into public.leads (business_id, name) values (${businessB.id}::uuid, 'Cross-tenant')`,
  );
  const ordinaryLeadUpdate = await userWrite(
    ownerA,
    sql`update public.leads set name = 'Updated lead', company = 'Updated company' where id = ${leadA.id}::uuid returning id`,
  );
  assert.equal(ordinaryLeadUpdate.length, 1);
  for (const [label, statement] of [
    ["lead business reassignment", sql`update public.leads set business_id = ${businessB.id}::uuid where id = ${leadA.id}::uuid`],
    ["lead id mutation", sql`update public.leads set id = ${randomUUID()}::uuid where id = ${leadA.id}::uuid`],
    ["lead created_at mutation", sql`update public.leads set created_at = now() where id = ${leadA.id}::uuid`],
    ["lead score tampering", sql`update public.leads set score = 99, score_breakdown = '{"tampered":true}'::jsonb, score_explanation = 'tampered' where id = ${leadA.id}::uuid`],
    ["lead delete", sql`delete from public.leads where id = ${leadA.id}::uuid`],
  ]) {
    await expectDenied(label, ownerA, statement);
  }
  await expectDenied("non-member lead insert", userC, sql`insert into public.leads (business_id, name) values (${businessA.id}::uuid, 'Denied')`);

  // Chat sessions and messages.
  assert.equal((await userRows(ownerA, sql`select id from public.chat_sessions where id = ${sessionA.id}::uuid`)).length, 1);
  assert.equal((await userRows(ownerA, sql`select id from public.chat_sessions where id = ${sessionB.id}::uuid`)).length, 0);
  assert.equal((await userRows(userC, sql`select id from public.chat_sessions`)).length, 0);
  const createdSession = await userWrite(
    ownerA,
    sql`insert into public.chat_sessions (business_id, lead_id, status) values (${businessA.id}::uuid, ${leadA.id}::uuid, 'active') returning id, visitor_id`,
  );
  assert.equal(createdSession.length, 1);
  assert.ok(createdSession[0].visitor_id);
  fixtures.created.sessions.push(createdSession[0].id);
  await expectDenied("cross-tenant session insert", ownerA, sql`insert into public.chat_sessions (business_id, lead_id) values (${businessB.id}::uuid, ${leadB.id}::uuid)`);
  const sessionUpdate = await userWrite(ownerA, sql`update public.chat_sessions set status = 'completed' where id = ${sessionA.id}::uuid returning id`);
  assert.equal(sessionUpdate.length, 1);
  for (const [label, statement] of [
    ["session business reassignment", sql`update public.chat_sessions set business_id = ${businessB.id}::uuid where id = ${sessionA.id}::uuid`],
    ["session id mutation", sql`update public.chat_sessions set id = ${randomUUID()}::uuid where id = ${sessionA.id}::uuid`],
    ["session visitor mutation", sql`update public.chat_sessions set visitor_id = ${randomUUID()}::uuid where id = ${sessionA.id}::uuid`],
    ["session created_at mutation", sql`update public.chat_sessions set created_at = now() where id = ${sessionA.id}::uuid`],
    ["session cross-business lead", sql`update public.chat_sessions set lead_id = ${leadB.id}::uuid where id = ${sessionA.id}::uuid`],
    ["session delete", sql`delete from public.chat_sessions where id = ${sessionA.id}::uuid`],
  ]) {
    await expectDenied(label, ownerA, statement);
  }
  const createdMessage = await userWrite(
    ownerA,
    sql`insert into public.messages (business_id, session_id, role, content) values (${businessA.id}::uuid, ${createdSession[0].id}::uuid, 'user', 'Security message') returning id`,
  );
  assert.equal(createdMessage.length, 1);
  fixtures.created.messages.push(createdMessage[0].id);
  assert.equal((await userRows(ownerA, sql`select id from public.messages where id = ${messageA.id}::uuid`)).length, 1);
  assert.equal((await userRows(ownerA, sql`select id from public.messages where id = ${messageB.id}::uuid`)).length, 0);
  for (const [label, statement] of [
    ["cross-tenant message", sql`insert into public.messages (business_id, session_id, role, content) values (${businessB.id}::uuid, ${sessionB.id}::uuid, 'user', 'Denied')`],
    ["message session mismatch", sql`insert into public.messages (business_id, session_id, role, content) values (${businessA.id}::uuid, ${sessionB.id}::uuid, 'user', 'Mismatch')`],
    ["assistant message spoof", sql`insert into public.messages (business_id, session_id, role, content) values (${businessA.id}::uuid, ${sessionA.id}::uuid, 'assistant', 'Spoof')`],
    ["system message spoof", sql`insert into public.messages (business_id, session_id, role, content) values (${businessA.id}::uuid, ${sessionA.id}::uuid, 'system', 'Spoof')`],
    ["message metadata tampering", sql`insert into public.messages (business_id, session_id, role, content, status, provider, model, input_tokens, output_tokens, total_tokens, metadata, error_code) values (${businessA.id}::uuid, ${sessionA.id}::uuid, 'user', 'Tamper', 'error', 'client', 'client', 1, 2, 3, '{"tampered":true}'::jsonb, 'tampered')`],
    ["message update", sql`update public.messages set content = 'Tampered' where id = ${messageA.id}::uuid`],
    ["message delete", sql`delete from public.messages where id = ${messageA.id}::uuid`],
  ]) {
    await expectDenied(label, ownerA, statement);
  }

  // Knowledge documents and chunks.
  assert.equal((await userRows(ownerA, sql`select id from public.knowledge_documents where id = ${documentA.id}::uuid`)).length, 1);
  assert.equal((await userRows(ownerA, sql`select id from public.knowledge_documents where id = ${documentB.id}::uuid`)).length, 0);
  assert.equal((await userRows(ownerB, sql`select id from public.knowledge_documents where id = ${documentB.id}::uuid`)).length, 1);
  assert.equal((await userRows(userC, sql`select id from public.knowledge_documents`)).length, 0);
  for (const [user, name] of [[ownerA, "owner document"], [adminA, "admin document"]]) {
    const created = await userWrite(
      user,
      sql`insert into public.knowledge_documents (business_id, created_by_profile_id, name, document_type) values (${businessA.id}::uuid, ${user.id}::uuid, ${name}, 'text') returning id`,
    );
    assert.equal(created.length, 1);
    fixtures.created.documents.push(created[0].id);
  }
  await expectDenied("member document insert", memberA, sql`insert into public.knowledge_documents (business_id, created_by_profile_id, name, document_type) values (${businessA.id}::uuid, ${memberA.id}::uuid, 'Denied', 'text')`);
  await expectDenied("cross-tenant document insert", ownerA, sql`insert into public.knowledge_documents (business_id, created_by_profile_id, name, document_type) values (${businessB.id}::uuid, ${ownerA.id}::uuid, 'Denied', 'text')`);
  await expectDenied("document creator spoof", ownerA, sql`insert into public.knowledge_documents (business_id, created_by_profile_id, name, document_type) values (${businessA.id}::uuid, ${ownerB.id}::uuid, 'Denied', 'text')`);
  assert.equal((await userWrite(ownerA, sql`update public.knowledge_documents set name = 'Updated document', status = 'archived' where id = ${documentA.id}::uuid returning id`)).length, 1);
  assert.equal((await userWrite(adminA, sql`update public.knowledge_documents set name = 'Admin document update' where id = ${documentA.id}::uuid returning id`)).length, 1);
  await expectNoRows("member document update", memberA, sql`update public.knowledge_documents set name = 'Denied' where id = ${documentA.id}::uuid returning id`);
  await expectNoRows("cross-tenant document update", ownerA, sql`update public.knowledge_documents set name = 'Denied' where id = ${documentB.id}::uuid returning id`);
  await expectDenied("document tenant reassignment", ownerA, sql`update public.knowledge_documents set business_id = ${businessB.id}::uuid where id = ${documentA.id}::uuid`);
  await expectDenied("document creator reassignment", ownerA, sql`update public.knowledge_documents set created_by_profile_id = ${ownerB.id}::uuid where id = ${documentA.id}::uuid`);
  await expectDenied("document delete", ownerA, sql`delete from public.knowledge_documents where id = ${documentA.id}::uuid`);
  assert.equal((await userRows(ownerA, sql`select id from public.document_chunks where id = ${chunkA.id}::uuid`)).length, 1);
  assert.equal((await userRows(ownerA, sql`select id from public.document_chunks where id = ${chunkB.id}::uuid`)).length, 0);
  assert.equal((await userRows(ownerB, sql`select id from public.document_chunks where id = ${chunkB.id}::uuid`)).length, 1);
  for (const [label, statement] of [
    ["chunk insert", sql`insert into public.document_chunks (business_id, document_id, chunk_index, content) values (${businessA.id}::uuid, ${documentA.id}::uuid, 99, 'Denied')`],
    ["chunk/document composite mismatch", sql`insert into public.document_chunks (business_id, document_id, chunk_index, content) values (${businessA.id}::uuid, ${documentB.id}::uuid, 98, 'Mismatch')`],
    ["chunk embedding tampering", sql`update public.document_chunks set embedding_model = 'tampered', content = 'Tampered', metadata = '{"tampered":true}'::jsonb, chunk_index = 99 where id = ${chunkA.id}::uuid`],
    ["chunk tenant reassignment", sql`update public.document_chunks set business_id = ${businessB.id}::uuid where id = ${chunkA.id}::uuid`],
    ["chunk document reassignment", sql`update public.document_chunks set document_id = ${documentB.id}::uuid where id = ${chunkA.id}::uuid`],
    ["chunk delete", sql`delete from public.document_chunks where id = ${chunkA.id}::uuid`],
  ]) {
    await expectDenied(label, ownerA, statement);
  }

  // Anonymous direct access to every private application table.
  const anonymousTables = [
    "businesses",
    "profiles",
    "business_memberships",
    "leads",
    "chat_sessions",
    "messages",
    "knowledge_documents",
    "document_chunks",
  ];
  for (const table of anonymousTables) {
    await expectAnonymousDenied(
      `anonymous SELECT ${table}`,
      (transaction) => transaction.unsafe(`select * from public.${table}`),
    );
  }

  return {
    matrix: {
      ownerA: "business A resources allowed according to role rules; business B denied",
      adminA: "business A document/business management allowed; unrelated tenant denied",
      memberA: "business A reads and operational lead/session/message access allowed; management writes denied",
      ownerB: "business B resources allowed; business A denied",
      userC: "all private resource reads/writes denied",
      anonymous: "all eight private tables denied",
      applicationDal: "real DAL uses the request-scoped RLS transaction",
    },
    attacks: {
      selfRoleEscalation: "blocked",
      crossBusinessMembership: "blocked",
      businessOwnershipManipulation: "blocked",
      tenantReassignment: "blocked",
      leadScoreTampering: "blocked",
      visitorIdTampering: "blocked",
      assistantSystemSpoofing: "blocked",
      documentCreatorSpoofing: "blocked",
      chunkEmbeddingTampering: "blocked",
    },
  };
}

let report;
let testError;
try {
  await setupFixtures();
  report = await runSecurityTests();
  report.inventory = await inventory();
  console.log("Full RLS security suite passed.");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  testError = error;
  console.error("Full RLS security suite failed.");
  console.error(error instanceof Error ? error.stack : error);
} finally {
  try {
    await cleanupFixtures();
  } catch (error) {
    console.error("Fixture cleanup failed.");
    console.error(error instanceof Error ? error.stack : error);
    testError ??= error;
  }
  await direct.end({ timeout: 5 });
}

if (testError) {
  process.exitCode = 1;
}

// withAuthenticatedDb owns the application pool, so a standalone test runner
// must terminate after cleanup rather than waiting on the idle application
// connection indefinitely.
process.exit(testError ? 1 : 0);
