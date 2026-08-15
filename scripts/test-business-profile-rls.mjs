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

async function visibleBusinessIds(transaction) {
  const rows = await transaction`
    select id::text
    from public.businesses
    order by id
  `;

  return rows.map((row) => row.id);
}

async function visibleProfileIds(transaction) {
  const rows = await transaction`
    select id::text
    from public.profiles
    order by id
  `;

  return rows.map((row) => row.id);
}

let savepointNumber = 0;

async function expectDenied(transaction, operation, callback) {
  const savepoint = `closer_rls_denied_${savepointNumber++}`;

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

      const owner = fixtureUser("closer-rls-owner");
      const admin = fixtureUser("closer-rls-admin");
      const member = fixtureUser("closer-rls-member");
      const otherBusinessMember = fixtureUser("closer-rls-other-member");
      const nonMember = fixtureUser("closer-rls-non-member");
      const insertOnly = fixtureUser("closer-rls-insert-only");
      const users = [
        owner,
        admin,
        member,
        otherBusinessMember,
        nonMember,
        insertOnly,
      ];

      for (const user of users) {
        await insertAuthUser(transaction, user);
      }

      for (const user of [
        owner,
        admin,
        member,
        otherBusinessMember,
        nonMember,
      ]) {
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
          (${businessA.id}::uuid, ${member.id}::uuid, 'member'),
          (${businessB.id}::uuid, ${otherBusinessMember.id}::uuid, 'member')
      `;

      const expectedBusinessA = [businessA.id];
      const expectedBusinessB = [businessB.id];

      for (const user of [owner, admin, member]) {
        await asAuthenticatedUser(transaction, user.id, async (scoped) => {
          assert.deepEqual(
            await visibleBusinessIds(scoped),
            expectedBusinessA,
            `${user.email} must see only Business A`,
          );
          assert.deepEqual(
            await visibleProfileIds(scoped),
            [user.id].sort(),
            `${user.email} must see only their own profile`,
          );
        });
      }

      await asAuthenticatedUser(
        transaction,
        otherBusinessMember.id,
        async (scoped) => {
          assert.deepEqual(
            await visibleBusinessIds(scoped),
            expectedBusinessB,
            "the Business B member must not see Business A",
          );
          assert.deepEqual(
            await visibleProfileIds(scoped),
            [otherBusinessMember.id].sort(),
            "the Business B member must see only their own profile",
          );
        },
      );

      await asAuthenticatedUser(
        transaction,
        nonMember.id,
        async (scoped) => {
          assert.deepEqual(
            await visibleBusinessIds(scoped),
            [],
            "a non-member must not see any business",
          );
          assert.deepEqual(
            await visibleProfileIds(scoped),
            [nonMember.id].sort(),
            "a non-member may see only their own profile",
          );
        },
      );

      for (const user of [owner, admin]) {
        await asAuthenticatedUser(transaction, user.id, async (scoped) => {
          const updated = await scoped`
            update public.businesses
            set name = ${`RLS ${user.email}`}
            where id = ${businessA.id}::uuid
            returning id
          `;

          assert.equal(updated.length, 1, `${user.email} may update Business A`);

          const crossTenant = await scoped`
            update public.businesses
            set name = 'must remain unchanged'
            where id = ${businessB.id}::uuid
            returning id
          `;

          assert.equal(
            crossTenant.length,
            0,
            `${user.email} must not update Business B`,
          );
        });
      }

      await asAuthenticatedUser(transaction, member.id, async (scoped) => {
        const updated = await scoped`
          update public.businesses
          set name = 'member must not update'
          where id = ${businessA.id}::uuid
          returning id
        `;

        assert.equal(updated.length, 0, "a member must not update Business A");
      });

      await asAuthenticatedUser(
        transaction,
        otherBusinessMember.id,
        async (scoped) => {
          const crossTenant = await scoped`
            update public.businesses
            set name = 'cross-tenant update must not work'
            where id = ${businessA.id}::uuid
            returning id
          `;

          assert.equal(
            crossTenant.length,
            0,
            "the Business B member must not update Business A",
          );
        },
      );

      await asAuthenticatedUser(transaction, owner.id, async (scoped) => {
        await expectDenied(transaction, "business INSERT", () =>
          scoped`
            insert into public.businesses (name, slug)
            values ('unauthorized', ${`unauthorized-${randomUUID()}`})
          `,
        );
        await expectDenied(transaction, "business DELETE", () =>
          scoped`delete from public.businesses where id = ${businessA.id}::uuid`,
        );
        await expectDenied(transaction, "business identity update", () =>
          scoped`
            update public.businesses
            set id = ${randomUUID()}::uuid
            where id = ${businessA.id}::uuid
          `,
        );
      });

      await asAuthenticatedUser(transaction, owner.id, async (scoped) => {
        const updated = await scoped`
          update public.profiles
          set full_name = 'Owner profile updated'
          where id = ${owner.id}::uuid
          returning id
        `;

        assert.equal(updated.length, 1, "a user may update their own profile");

        const otherProfile = await scoped`
          update public.profiles
          set full_name = 'must remain unchanged'
          where id = ${admin.id}::uuid
          returning id
        `;

        assert.equal(
          otherProfile.length,
          0,
          "a user must not update another profile",
        );

        await expectDenied(transaction, "profile identity update", () =>
          scoped`
            update public.profiles
            set id = ${randomUUID()}::uuid
            where id = ${owner.id}::uuid
          `,
        );
        await expectDenied(transaction, "profile DELETE", () =>
          scoped`delete from public.profiles where id = ${owner.id}::uuid`,
        );
      });

      await asAuthenticatedUser(transaction, insertOnly.id, async (scoped) => {
        const inserted = await scoped`
          insert into public.profiles (id, full_name)
          values (${insertOnly.id}::uuid, 'Insert-only profile')
          returning id
        `;

        assert.equal(inserted.length, 1, "a user may insert their own profile");

        await expectDenied(transaction, "cross-identity profile INSERT", () =>
          scoped`
            insert into public.profiles (id, full_name)
            values (${owner.id}::uuid, 'must be denied')
          `,
        );
      });

      await asAnonymous(transaction, async (scoped) => {
        await expectDenied(transaction, "anonymous business SELECT", () =>
          scoped`select id from public.businesses`,
        );
        await expectDenied(transaction, "anonymous profile SELECT", () =>
          scoped`select id from public.profiles`,
        );
      });

      result = {
        businessMembers: "owner/admin/member tenant reads passed",
        crossTenantReadsAndUpdates: "denied",
        businessRoleUpdates: "owner/admin allowed; member denied",
        businessIdentityProtection: "denied",
        profileSelfAccess: "passed",
        profileIdentityProtection: "denied",
        anonymousAccess: "denied",
      };

      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) {
      throw error;
    }
  }

  console.log("Business/profile RLS tests passed in a rollback-only transaction.");
  console.log(JSON.stringify(result, null, 2));
  console.log("No Auth users, profiles, memberships, or business rows were persisted.");
}

try {
  await runTests();
} catch (error) {
  console.error("Business/profile RLS tests failed.");
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
