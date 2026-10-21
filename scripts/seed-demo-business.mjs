import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const args = new Set(process.argv.slice(2));

if (args.has("--help")) {
  console.log(`Demo business seed usage:

  CLOSER_SEED_MODE=development npm run demo:seed -- --confirm-development

This creates or updates only the public Northstar Fitness demo business and
its ready knowledge document. It does not require a Closer user account.`);
  process.exit(0);
}

if (process.env.NODE_ENV === "production") {
  throw new Error("The demo seed cannot run when NODE_ENV=production.");
}

if (process.env.CLOSER_SEED_MODE !== "development") {
  throw new Error(
    "Set CLOSER_SEED_MODE=development before running the demo seed.",
  );
}

if (!args.has("--confirm-development")) {
  throw new Error(
    "Pass --confirm-development to confirm that this is a development database.",
  );
}

const directUrl = process.env.DIRECT_URL;

if (!directUrl) {
  throw new Error("DIRECT_URL is not configured.");
}

const business = {
  id: "00000000-0000-4000-8000-000000000003",
  name: "Northstar Fitness",
  slug: "northstar-fitness",
};
const document = {
  id: "00000000-0000-4000-8000-000000000303",
  name: "Northstar Fitness · Visitor Guide",
  sourceUri: "seed://closer-demo/northstar-fitness",
};
const embeddingModel = "sentence-transformers/all-MiniLM-L6-v2";
const modelSource = "Xenova/all-MiniLM-L6-v2";
const sourceChunks = [
  {
    id: "00000000-0000-4000-8000-000000000701",
    content:
      "Northstar Fitness is a fictional neighborhood fitness studio in Manila. It offers small-group strength training, yoga, mobility classes, and beginner-friendly coaching. The studio is located at 42 Beacon Street, Makati. First-time visitors can book an introductory class to meet a coach and tour the studio.",
    metadata: { section: "studio overview" },
  },
  {
    id: "00000000-0000-4000-8000-000000000702",
    content:
      "Northstar Fitness sample pricing: a single class costs ₱650, a five-class pack costs ₱2,800, and an unlimited monthly membership costs ₱4,500. The introductory first class is ₱350. Memberships include access to strength, yoga, and mobility group classes. These prices are fictional demo information.",
    metadata: { section: "classes and sample pricing" },
  },
  {
    id: "00000000-0000-4000-8000-000000000703",
    content:
      "Northstar Fitness is open Monday to Friday from 6:00 AM to 8:00 PM and Saturday to Sunday from 8:00 AM to 4:00 PM. Please arrive ten minutes before class. Visitors can cancel or reschedule a class up to eight hours before it starts. The studio provides mats; bring comfortable clothes and a water bottle.",
    metadata: { section: "hours and visitor policies" },
  },
];

async function embedChunks() {
  const { env, pipeline } = await import("@huggingface/transformers");
  env.cacheDir = join(tmpdir(), "closer-transformers-cache");
  const extractor = await pipeline("feature-extraction", modelSource, {
    dtype: "q8",
  });

  const embedded = [];

  for (const chunk of sourceChunks) {
    const result = await extractor(chunk.content, {
      pooling: "mean",
      normalize: true,
    });
    const embedding = Array.from(result.data);

    if (
      embedding.length !== 384 ||
      embedding.some((value) => !Number.isFinite(value))
    ) {
      throw new Error("The local model returned an invalid demo embedding.");
    }

    embedded.push({ ...chunk, embedding });
  }

  return embedded;
}

const chunks = await embedChunks();
const client = postgres(directUrl, { max: 1, prepare: false });

try {
  await client.begin(async (tx) => {
    await tx`
      insert into businesses (id, name, slug, archived_at)
      values (${business.id}::uuid, ${business.name}, ${business.slug}, ${null})
      on conflict (id) do update set
        name = excluded.name,
        slug = excluded.slug,
        archived_at = null,
        updated_at = now()
    `;

    await tx`
      insert into knowledge_documents (
        id, business_id, created_by_profile_id, name, document_type,
        source_uri, status, metadata
      )
      values (
        ${document.id}::uuid,
        ${business.id}::uuid,
        ${null}::uuid,
        ${document.name},
        ${"text"},
        ${document.sourceUri},
        ${"ready"},
        ${client.json({ source: "closer-demo", fictional: true })}::jsonb
      )
      on conflict (id) do update set
        business_id = excluded.business_id,
        created_by_profile_id = excluded.created_by_profile_id,
        name = excluded.name,
        document_type = excluded.document_type,
        source_uri = excluded.source_uri,
        status = excluded.status,
        metadata = excluded.metadata,
        updated_at = now()
    `;

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const serializedEmbedding = `[${chunk.embedding
        .map((value) => value.toFixed(8))
        .join(",")}]`;

      await tx`
        insert into document_chunks (
          id, business_id, document_id, chunk_index, content, metadata,
          embedding, embedding_model
        )
        values (
          ${chunk.id}::uuid,
          ${business.id}::uuid,
          ${document.id}::uuid,
          ${index},
          ${chunk.content},
          ${client.json(chunk.metadata)}::jsonb,
          cast(${serializedEmbedding} as vector),
          ${embeddingModel}
        )
        on conflict (id) do update set
          business_id = excluded.business_id,
          document_id = excluded.document_id,
          chunk_index = excluded.chunk_index,
          content = excluded.content,
          metadata = excluded.metadata,
          embedding = excluded.embedding,
          embedding_model = excluded.embedding_model
      `;
    }
  });

  console.log("Closer demo business is ready.");
  console.log(`Business: ${business.name} (${business.slug})`);
  console.log(`Knowledge chunks: ${chunks.length} (${embeddingModel})`);
  console.log("The demo business is separate from signed-in workspaces.");
} catch (error) {
  console.error("Demo business seed failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
