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
const roles = ["owner", "admin", "member"];

function fixtureUser(label) {
  const id = randomUUID();
  return {
    id,
    email: `closer-authz-${label}-${id}@example.invalid`,
  };
}

async function insertAuthUser(transaction, user) {
  await transaction`
    insert into auth.users (
      id, aud, role, email, created_at, updated_at, is_sso_user, is_anonymous
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
  await transaction.unsafe("set local role authenticated");
  await transaction`select set_config('request.jwt.claim.sub', ${userId}, true)`;
  await transaction`select set_config('request.jwt.claim.role', 'authenticated', true)`;
  return callback(transaction);
}

async function isBusinessMember(transaction, businessId) {
  const [row] = await transaction`
    select private.is_business_member(${businessId}::uuid) as result
  `;

  return row?.result === true;
}

async function hasBusinessRole(transaction, businessId, role) {
  const [row] = await transaction`
    select private.has_business_role(
      ${businessId}::uuid,
      array[${role}]::public.membership_role[]
    ) as result
  `;

  return row?.result === true;
}

async function runTests() {
  await client.begin(async (transaction) => {
    const [businessA, businessB] = await transaction`
      select id::text, slug
      from public.businesses
      order by slug
      limit 2
    `;

    assert.ok(businessA?.id && businessB?.id, "two businesses are required");

    const owner = fixtureUser("owner");
    const admin = fixtureUser("admin");
    const member = fixtureUser("member");
    const nonMember = fixtureUser("non-member");

    await transaction.unsafe("set local role postgres");
    for (const user of [owner, admin, member, nonMember]) {
      await insertAuthUser(transaction, user);
      await transaction`
        insert into public.profiles (id, full_name)
        values (${user.id}::uuid, ${user.email})
      `;
    }

    await transaction`
      insert into public.business_memberships (business_id, profile_id, role)
      values
        (${businessA.id}::uuid, ${owner.id}::uuid, 'owner'),
        (${businessA.id}::uuid, ${admin.id}::uuid, 'admin'),
        (${businessA.id}::uuid, ${member.id}::uuid, 'member')
    `;

    const memberResults = await asAuthenticatedUser(
      transaction,
      member.id,
      async (scoped) => {
        const [identity] = await scoped`
          select auth.uid()::text as user_id
        `;
        const [nullBusiness] = await scoped`
          select private.is_business_member(null::uuid) as result
        `;
        const [emptyRoles] = await scoped`
          select private.has_business_role(
            ${businessA.id}::uuid,
            array[]::public.membership_role[]
          ) as result
        `;

        return {
          identityMatches: identity?.user_id === member.id,
          businessMember: await isBusinessMember(scoped, businessA.id),
          otherBusinessMember: await isBusinessMember(scoped, businessB.id),
          nonexistentBusinessMember: await isBusinessMember(
            scoped,
            "00000000-0000-4000-8000-000000000999",
          ),
          nullBusiness: nullBusiness?.result,
          emptyRoles: emptyRoles?.result,
        };
      },
    );

    assert.deepEqual(memberResults, {
      identityMatches: true,
      businessMember: true,
      otherBusinessMember: false,
      nonexistentBusinessMember: false,
      nullBusiness: false,
      emptyRoles: false,
    });

    for (const [name, user] of [
      ["owner", owner],
      ["admin", admin],
      ["member", member],
    ]) {
      const results = await asAuthenticatedUser(
        transaction,
        user.id,
        async (scoped) =>
          Object.fromEntries(
            await Promise.all(
              roles.map(async (role) => [
                role,
                await hasBusinessRole(scoped, businessA.id, role),
              ]),
            ),
          ),
      );

      for (const role of roles) {
        assert.equal(
          results[role],
          role === name,
          `${name} role check for ${role} did not match`,
        );
      }
    }

    const nonMemberResult = await asAuthenticatedUser(
      transaction,
      nonMember.id,
      (scoped) => isBusinessMember(scoped, businessA.id),
    );
    assert.equal(nonMemberResult, false);

    await transaction.unsafe("reset request.jwt.claim.sub");
    await transaction.unsafe("reset request.jwt.claim.role");
    await transaction.unsafe("set local role anon");

    await assert.rejects(
      () => transaction`
        select private.is_business_member(${businessA.id}::uuid) as result
      `,
      "anonymous helper execution must be denied",
    );

    console.log("Authorization helper tests passed in a rollback-only transaction.");
    console.log("Authenticated identity, membership, role, null, and anonymous checks passed.");

    throw rollback;
  }).catch((error) => {
    if (error !== rollback) {
      throw error;
    }
  });
}

try {
  await runTests();
} catch (error) {
  console.error("Authorization helper tests failed.");
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}

process.exit(process.exitCode ?? 0);
