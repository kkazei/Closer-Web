import { existsSync } from "node:fs";
import assert from "node:assert/strict";

import postgres from "postgres";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const requiredEnvironment = [
  "CLOSER_RLS_TEST_BUSINESS_ID",
  "CLOSER_RLS_TEST_OTHER_BUSINESS_ID",
  "CLOSER_RLS_TEST_MEMBER_USER_ID",
  "CLOSER_RLS_TEST_OWNER_USER_ID",
  "CLOSER_RLS_TEST_ADMIN_USER_ID",
  "CLOSER_RLS_TEST_NON_MEMBER_USER_ID",
];

const missing = requiredEnvironment.filter((name) => !process.env[name]);

if (missing.length > 0) {
  throw new Error(
    `Missing helper test environment variable(s): ${missing.join(", ")}`,
  );
}

if (!process.env.DIRECT_URL) {
  throw new Error("DIRECT_URL is not configured.");
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readUuid(name) {
  const value = process.env[name];

  if (!value || !uuidPattern.test(value)) {
    throw new Error(`${name} must be a valid UUID.`);
  }

  return value;
}

const fixture = {
  businessId: readUuid("CLOSER_RLS_TEST_BUSINESS_ID"),
  otherBusinessId: readUuid("CLOSER_RLS_TEST_OTHER_BUSINESS_ID"),
  memberUserId: readUuid("CLOSER_RLS_TEST_MEMBER_USER_ID"),
  ownerUserId: readUuid("CLOSER_RLS_TEST_OWNER_USER_ID"),
  adminUserId: readUuid("CLOSER_RLS_TEST_ADMIN_USER_ID"),
  nonMemberUserId: readUuid("CLOSER_RLS_TEST_NON_MEMBER_USER_ID"),
};

const roles = ["owner", "admin", "member"];
const client = postgres(process.env.DIRECT_URL, {
  max: 1,
  prepare: false,
});

async function asAuthenticatedUser(userId, callback) {
  return client.begin(async (transaction) => {
    await transaction.unsafe("set local role authenticated");
    await transaction`select set_config('request.jwt.claim.sub', ${userId}, true)`;
    await transaction`select set_config('request.jwt.claim.role', 'authenticated', true)`;

    return callback(transaction);
  });
}

async function isBusinessMember(transaction, businessId) {
  const [row] = await transaction`
    select private.is_business_member(${businessId}::uuid) as result
  `;

  return row?.result === true;
}

async function hasBusinessRole(transaction, businessId, role) {
  const [row] = await transaction.unsafe(`
    select private.has_business_role(
      '${businessId}'::uuid,
      ARRAY['${role}']::public.membership_role[]
    ) as result
  `);

  return row?.result === true;
}

async function runTests() {
  const memberResults = await asAuthenticatedUser(
    fixture.memberUserId,
    async (transaction) => {
      const [identity] = await transaction`
        select auth.uid()::text as user_id
      `;
      const [nullBusiness] = await transaction`
        select private.is_business_member(null::uuid) as result
      `;
      const [emptyRoles] = await transaction.unsafe(`
        select private.has_business_role(
          '${fixture.businessId}'::uuid,
          ARRAY[]::public.membership_role[]
        ) as result
      `);

      return {
        identityMatches: identity?.user_id === fixture.memberUserId,
        businessMember: await isBusinessMember(
          transaction,
          fixture.businessId,
        ),
        otherBusinessMember: await isBusinessMember(
          transaction,
          fixture.otherBusinessId,
        ),
        nonexistentBusinessMember: await isBusinessMember(
          transaction,
          "00000000-0000-4000-8000-000000000999",
        ),
        nullBusiness: nullBusiness?.result,
        emptyRoles: emptyRoles?.result,
      };
    },
  );

  assert.equal(memberResults.identityMatches, true);
  assert.equal(memberResults.businessMember, true);
  assert.equal(memberResults.otherBusinessMember, false);
  assert.equal(memberResults.nonexistentBusinessMember, false);
  assert.equal(memberResults.nullBusiness, false);
  assert.equal(memberResults.emptyRoles, false);

  const roleFixtures = [
    { name: "owner", userId: fixture.ownerUserId },
    { name: "admin", userId: fixture.adminUserId },
    { name: "member", userId: fixture.memberUserId },
  ];

  for (const roleFixture of roleFixtures) {
    const roleResults = await asAuthenticatedUser(
      roleFixture.userId,
      async (transaction) =>
        Object.fromEntries(
          await Promise.all(
            roles.map(async (role) => [
              role,
              await hasBusinessRole(
                transaction,
                fixture.businessId,
                role,
              ),
            ]),
          ),
        ),
    );

    for (const role of roles) {
      assert.equal(
        roleResults[role],
        role === roleFixture.name,
        `${roleFixture.name} role check for ${role} did not match`,
      );
    }
  }

  const nonMemberResult = await asAuthenticatedUser(
    fixture.nonMemberUserId,
    (transaction) => isBusinessMember(transaction, fixture.businessId),
  );
  assert.equal(nonMemberResult, false);

  const anonymousDenied = await client.begin(async (transaction) => {
    await transaction.unsafe("set local role anon");

    try {
      await transaction`
        select private.is_business_member(${fixture.businessId}::uuid) as result
      `;
    } catch {
      return true;
    }

    return false;
  });

  assert.equal(anonymousDenied, true);

  console.log("Authorization helper tests passed.");
  console.log("Authenticated identity context: verified");
  console.log("Member/non-member business checks: passed");
  console.log("Owner/admin/member role checks: passed");
  console.log("NULL/empty/nonexistent input checks: passed");
  console.log("Anonymous helper execution denial: passed");
}

try {
  await runTests();
} catch (error) {
  console.error("Authorization helper tests failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
