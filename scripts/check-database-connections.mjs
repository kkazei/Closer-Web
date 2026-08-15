import { existsSync } from "node:fs";
import postgres from "postgres";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const connections = [
  {
    name: "DATABASE_URL",
    purpose: "runtime application connection",
  },
  {
    name: "DIRECT_URL",
    purpose: "migration and administrative connection",
  },
];

const missing = connections.filter(({ name }) => !process.env[name]);

if (missing.length > 0) {
  console.error("Database connection check could not run.");
  console.error(
    `Missing environment variable(s): ${missing.map(({ name }) => name).join(", ")}`,
  );
  process.exit(1);
}

for (const { name, purpose } of connections) {
  const client = postgres(process.env[name], {
    max: 1,
    prepare: false,
  });

  try {
    const result = await client`select 1 as connection_ok`;

    if (result[0]?.connection_ok !== 1) {
      throw new Error("The connection test returned an unexpected result.");
    }

    console.log(`${name} (${purpose}): connection successful`);
  } catch (error) {
    console.error(`${name} (${purpose}): connection failed`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await client.end({ timeout: 5 });
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
