import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import * as schema from "./schema";

/**
 * Database client for Closer.
 *
 * Uses the `postgres` driver with Drizzle ORM.
 * Requires DATABASE_URL to be set in environment variables.
 *
 * Usage:
 *   import { db } from "@/db";
 *   const result = await db.select().from(schema.someTable);
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Please configure your environment variables."
  );
}

const client = postgres(connectionString, {
  prepare: false, // Required for Supabase connection pooling (PgBouncer)
});

export const db = drizzle(client, { schema });
