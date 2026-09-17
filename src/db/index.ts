import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import {
  drizzle,
  type PostgresJsDatabase,
} from "drizzle-orm/postgres-js";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Please configure your environment variables."
  );
}

const client = postgres(connectionString, {
  prepare: false, // Required for Supabase connection pooling (PgBouncer)
});

/**
 * Drizzle database handle for trusted server operations.
 *
 * This connection uses the privileged PostgreSQL role from DATABASE_URL. It
 * must not be used for user-scoped requests because that role bypasses RLS.
 */
export const privilegedDb = drizzle(client, { schema });

/** Closes the trusted client for short-lived integration test processes. */
export async function closePrivilegedDb(): Promise<void> {
  await client.end({ timeout: 5 });
}

export type Database = PostgresJsDatabase<typeof schema>;

const requestDatabaseStorage = new AsyncLocalStorage<Database>();

function getRequestDatabase(): Database {
  const database = requestDatabaseStorage.getStore();

  if (!database) {
    throw new Error(
      "User-scoped database access requires withAuthenticatedDb().",
    );
  }

  return database;
}

/**
 * User-scoped Drizzle handle for the data-access layer.
 *
 * The handle is backed by the current request transaction. It deliberately
 * fails closed outside withAuthenticatedDb() so normal application code
 * cannot silently use the privileged connection and bypass RLS.
 */
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const database = getRequestDatabase();
    const value = Reflect.get(database as object, property, database);

    return typeof value === "function" ? value.bind(database) : value;
  },
});

export type AuthenticatedDbUser = Readonly<{
  userId: string;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertAuthenticatedUserId(userId: string): string {
  if (!UUID_PATTERN.test(userId)) {
    throw new Error("The authenticated user ID must be a valid UUID.");
  }

  return userId;
}

/**
 * Runs user-scoped Drizzle work in an RLS-aware transaction.
 *
 * The caller must pass the user identity returned by the application's
 * verified custom JWT flow. The role and JWT settings are transaction-local,
 * so they cannot leak to another pooled connection after commit or rollback.
 */
export async function withAuthenticatedDb<T>(
  authenticatedUser: AuthenticatedDbUser,
  callback: (database: Database) => Promise<T>,
): Promise<T> {
  const userId = assertAuthenticatedUserId(authenticatedUser.userId);

  const result = await privilegedDb.transaction(async (transaction) => {
    await transaction.execute(sql`set local role authenticated`);
    await transaction.execute(
      sql`select set_config('request.jwt.claim.sub', ${userId}, true)`,
    );
    await transaction.execute(
      sql`select set_config('request.jwt.claim.role', 'authenticated', true)`,
    );

    // Drizzle's native transaction preserves the request-local role and JWT
    // settings while providing a fully initialized Drizzle transaction.
    const requestDatabase = transaction as unknown as Database;

    return requestDatabaseStorage.run(requestDatabase, () =>
      callback(requestDatabase),
    );
  });

  // postgres.js unwraps promise-valued array elements in its generic result
  // type. The callback itself returns the requested T unchanged at runtime.
  return result as T;
}
