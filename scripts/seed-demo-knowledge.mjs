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
  console.log(`Demo knowledge seed usage:

  CLOSER_SEED_MODE=development npm run demo:knowledge -- --confirm-development

Adds fictional, clearly labeled showcase FAQs to the fixed Northstar Labs,
Harbor & Pine, and Northstar Fitness development businesses. It does not
change Acme Studios or any business outside this fixed allowlist.`);
  process.exit(0);
}

if (process.env.NODE_ENV === "production") {
  throw new Error("The demo knowledge seed cannot run when NODE_ENV=production.");
}

if (process.env.CLOSER_SEED_MODE !== "development") {
  throw new Error(
    "Set CLOSER_SEED_MODE=development before running the demo knowledge seed.",
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

const embeddingModel = "sentence-transformers/all-MiniLM-L6-v2";
const modelSource = "Xenova/all-MiniLM-L6-v2";
const businesses = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "northstar-labs",
    name: "Northstar Labs",
    documentId: "00000000-0000-4000-8000-000000000304",
    documentName: "Northstar Labs · Product FAQ (fictional demo)",
    chunks: [
      {
        id: "00000000-0000-4000-8000-000000000704",
        content:
          "Question: What does Closer do? Answer: Closer helps revenue teams qualify inbound conversations, collect structured lead context, and route promising opportunities. Teams can add approved product and pricing information so answers stay grounded in their own knowledge base. This is fictional showcase content.",
        metadata: { section: "product FAQ", source: "fictional-demo" },
      },
      {
        id: "00000000-0000-4000-8000-000000000705",
        content:
          "Question: What does Northstar Labs charge per month? Answer: No specific Northstar Labs price or monthly rate is configured in this fictional demo. Ask the Northstar Labs team for approved pricing. The assistant must not invent a price. This is fictional showcase guidance.",
        metadata: { section: "pricing FAQ", source: "fictional-demo" },
      },
    ],
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    slug: "harbor-and-pine",
    name: "Harbor & Pine",
    documentId: "00000000-0000-4000-8000-000000000305",
    documentName: "Harbor & Pine · Visitor FAQ (fictional demo)",
    chunks: [
      {
        id: "00000000-0000-4000-8000-000000000706",
        content:
          "Harbor & Pine is a fictional neighborhood cafe in Makati, Manila. Sample opening hours are Monday to Friday, 7:00 AM to 6:00 PM, and Saturday to Sunday, 8:00 AM to 5:00 PM. Sample menu prices: espresso ₱120, latte ₱180, pour-over coffee ₱220, and a breakfast sandwich ₱280. These details and prices are fictional demo information and are not real business offers.",
        metadata: { section: "visitor FAQ", source: "fictional-demo" },
      },
      {
        id: "00000000-0000-4000-8000-000000000707",
        content:
          "Question: What should I know before visiting Harbor & Pine? Answer: Harbor & Pine is a fictional cafe sample. Its sample hours are weekdays 7:00 AM to 6:00 PM and weekends 8:00 AM to 5:00 PM. Sample coffee prices range from ₱120 for espresso to ₱220 for pour-over coffee. Confirm current hours and menu details with staff; all information in this showcase is fictional.",
        metadata: { section: "visiting FAQ", source: "fictional-demo" },
      },
    ],
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    slug: "northstar-fitness",
    name: "Northstar Fitness",
    documentId: "00000000-0000-4000-8000-000000000306",
    documentName: "Northstar Fitness · Membership FAQ (fictional demo)",
    chunks: [
      {
        id: "00000000-0000-4000-8000-000000000708",
        content:
          "Question: What does a monthly membership cost? Answer: An unlimited monthly membership at Northstar Fitness costs ₱4,500 per month. The membership includes strength, yoga, and mobility group classes. This is fictional demo pricing.",
        metadata: { section: "monthly membership pricing", source: "fictional-demo" },
      },
      {
        id: "00000000-0000-4000-8000-000000000709",
        content:
          "Question: How much is a class or class pack at Northstar Fitness? Answer: A single class costs ₱650, a five-class pack costs ₱2,800, and an introductory first class costs ₱350. These are fictional sample prices.",
        metadata: { section: "class pricing", source: "fictional-demo" },
      },
    ],
  },
];

async function embedChunks() {
  const { env, pipeline } = await import("@huggingface/transformers");
  env.cacheDir = join(tmpdir(), "closer-transformers-cache");
  const extractor = await pipeline("feature-extraction", modelSource, {
    dtype: "q8",
  });

  for (const business of businesses) {
    for (const chunk of business.chunks) {
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

      chunk.embedding = embedding;
    }
  }
}

await embedChunks();
const client = postgres(directUrl, { max: 1, prepare: false });

try {
  await client.begin(async (tx) => {
    for (const business of businesses) {
      const [existingBusiness] = await tx`
        select id from businesses
        where id = ${business.id}::uuid
          and slug = ${business.slug}
          and name = ${business.name}
          and archived_at is null
      `;

      if (!existingBusiness) {
        throw new Error(
          `Expected development demo business is missing or changed: ${business.slug}.`,
        );
      }

      await tx`
        insert into knowledge_documents (
          id, business_id, created_by_profile_id, name, document_type,
          source_uri, status, metadata
        )
        values (
          ${business.documentId}::uuid,
          ${business.id}::uuid,
          null,
          ${business.documentName},
          ${"text"},
          ${`seed://closer-demo/${business.slug}/faq`},
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

      for (let index = 0; index < business.chunks.length; index += 1) {
        const chunk = business.chunks[index];
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
            ${business.documentId}::uuid,
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
    }
  });

  console.log("Showcase FAQs are ready for the three demo businesses.");
  console.log("All added information is labeled as fictional demo content.");
  console.log("Acme Studios and archived documents were left untouched.");
} catch (error) {
  console.error("Demo knowledge seed failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
