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

async function visibleMemberships(transaction) {
  const rows = await transaction`
    select business_id::text, profile_id::text, role::text
    from public.business_memberships
    order by business_id, profile_id
  `;

  return rows.map((row) => ({
    business_id: row.business_id,
    profile_id: row.profile_id,
    role: row.role,
  }));
}

async function expectDenied(transaction, operation, callback) {
  const savepoint = `closer_membership_rls_denied_${savepointNumber++}`;

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

function membershipRows(businessId, memberships) {
  return memberships
    .map(({ profileId, role }) => ({
      business_id: businessId,
      profile_id: profileId,
      role,
    }))
    .sort((left, right) => left.profile_id.localeCompare(right.profile_id));
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

      const owner = fixtureUser("closer-membership-owner");
      const admin = fixtureUser("closer-membership-admin");
      const member = fixtureUser("closer-membership-member");
      const userB = fixtureUser("closer-membership-business-b");
      const userC = fixtureUser("closer-membership-non-member");
      const users = [owner, admin, member, userB, userC];

      for (const user of users) {
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
          (${businessA.id}::uuid, ${member.id}::uuid, 'member'),
          (${businessB.id}::uuid, ${userB.id}::uuid, 'member')
      `;

      const businessARows = membershipRows(businessA.id, [
        { profileId: owner.id, role: "owner" },
        { profileId: admin.id, role: "admin" },
        { profileId: member.id, role: "member" },
      ]);
      const businessBRows = membershipRows(businessB.id, [
        { profileId: userB.id, role: "member" },
      ]);

      for (const [label, user] of [
        ["owner", owner],
        ["admin", admin],
        ["member", member],
      ]) {
        await asAuthenticatedUser(transaction, user.id, async (scoped) => {
          assert.deepEqual(
            await visibleMemberships(scoped),
            businessARows,
            `${label} must read only Business A memberships`,
          );
        });
      }

      await asAuthenticatedUser(transaction, userB.id, async (scoped) => {
        assert.deepEqual(
          await visibleMemberships(scoped),
          businessBRows,
          "Business B member must read only Business B memberships",
        );
      });

      await asAuthenticatedUser(transaction, userC.id, async (scoped) => {
        assert.deepEqual(
          await visibleMemberships(scoped),
          [],
          "a non-member must not read memberships",
        );
      });

      for (const [label, user] of [
        ["owner", owner],
        ["admin", admin],
        ["member", member],
        ["Business B member", userB],
        ["non-member", userC],
      ]) {
        await asAuthenticatedUser(transaction, user.id, async (scoped) => {
          await expectDenied(transaction, `${label} membership INSERT`, () =>
            scoped`
              insert into public.business_memberships (
                business_id,
                profile_id,
                role
              ) values (
                ${businessB.id}::uuid,
                ${userC.id}::uuid,
                'owner'
              )
            `,
          );
          await expectDenied(transaction, `${label} membership UPDATE`, () =>
            scoped`
              update public.business_memberships
              set role = 'owner'
              where business_id = ${businessA.id}::uuid
                and profile_id = ${member.id}::uuid
            `,
          );
          await expectDenied(transaction, `${label} membership DELETE`, () =>
            scoped`
              delete from public.business_memberships
              where business_id = ${businessA.id}::uuid
                and profile_id = ${member.id}::uuid
            `,
          );
        });
      }

      await asAuthenticatedUser(transaction, member.id, async (scoped) => {
        await expectDenied(transaction, "member self-owner INSERT", () =>
          scoped`
            insert into public.business_memberships (
              business_id,
              profile_id,
              role
            ) values (
              ${businessB.id}::uuid,
              ${member.id}::uuid,
              'owner'
            )
          `,
        );
        await expectDenied(transaction, "member self-admin UPDATE", () =>
          scoped`
            update public.business_memberships
            set role = 'admin'
            where business_id = ${businessA.id}::uuid
              and profile_id = ${member.id}::uuid
          `,
        );
        await expectDenied(transaction, "member promote another user", () =>
          scoped`
            update public.business_memberships
            set role = 'owner'
            where business_id = ${businessA.id}::uuid
              and profile_id = ${admin.id}::uuid
          `,
        );
        await expectDenied(transaction, "member remove owner", () =>
          scoped`
            delete from public.business_memberships
            where business_id = ${businessA.id}::uuid
              and profile_id = ${owner.id}::uuid
          `,
        );
        await expectDenied(transaction, "member remove self", () =>
          scoped`
            delete from public.business_memberships
            where business_id = ${businessA.id}::uuid
              and profile_id = ${member.id}::uuid
          `,
        );
        await expectDenied(transaction, "member change target business", () =>
          scoped`
            update public.business_memberships
            set business_id = ${businessB.id}::uuid
            where business_id = ${businessA.id}::uuid
              and profile_id = ${member.id}::uuid
          `,
        );
      });

      await asAuthenticatedUser(transaction, admin.id, async (scoped) => {
        await expectDenied(transaction, "admin grant owner", () =>
          scoped`
            update public.business_memberships
            set role = 'owner'
            where business_id = ${businessA.id}::uuid
              and profile_id = ${member.id}::uuid
          `,
        );
      });

      await asAnonymous(transaction, async (scoped) => {
        await expectDenied(transaction, "anonymous membership SELECT", () =>
          scoped`select business_id from public.business_memberships`,
        );
        await expectDenied(transaction, "anonymous membership INSERT", () =>
          scoped`
            insert into public.business_memberships (
              business_id,
              profile_id,
              role
            ) values (
              ${businessA.id}::uuid,
              ${userC.id}::uuid,
              'member'
            )
          `,
        );
      });

      result = {
        ownerRead: "allowed for own business; unrelated business hidden",
        adminRead: "allowed for own business; unrelated business hidden",
        memberRead: "allowed for own business; unrelated business hidden",
        nonMemberRead: "denied",
        anonymousRead: "denied",
        inserts: "denied for all tested actors",
        updates: "denied for all tested actors",
        deletes: "denied for all tested actors",
        escalation: "self-role, cross-business, promotion, and owner-removal attempts denied",
      };

      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) {
      throw error;
    }
  }

  console.log("Business membership RLS tests passed in a rollback-only transaction.");
  console.log(JSON.stringify(result, null, 2));
  console.log("No Auth users, profiles, or memberships were persisted.");
}

try {
  await runTests();
} catch (error) {
  console.error("Business membership RLS tests failed.");
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
