import { existsSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const directUrl = process.env.DIRECT_URL;

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    // Drizzle Kit uses the direct connection for migrations. An empty value
    // keeps schema-only commands usable before local credentials are set.
    url: directUrl ?? "",
  },
});
