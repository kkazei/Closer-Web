import { existsSync } from "node:fs";

import postgres from "postgres";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const args = new Set(process.argv.slice(2));

if (args.has("--help")) {
  console.log(`Development seed usage:

  CLOSER_SEED_MODE=development npm run db:seed -- --confirm-development

Optional existing Supabase Auth profile:

  CLOSER_SEED_AUTH_USER_ID=<existing auth.users UUID> \
    CLOSER_SEED_MODE=development npm run db:seed -- --confirm-development

The seed never creates Auth users or passwords. The migration must already be
applied, and production mode is rejected.`);
  process.exit(0);
}

if (process.env.NODE_ENV === "production") {
  throw new Error("The development seed cannot run when NODE_ENV=production.");
}

if (process.env.CLOSER_SEED_MODE !== "development") {
  throw new Error(
    "Set CLOSER_SEED_MODE=development before running the development seed.",
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

const authUserId = process.env.CLOSER_SEED_AUTH_USER_ID;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (authUserId && !uuidPattern.test(authUserId)) {
  throw new Error("CLOSER_SEED_AUTH_USER_ID must be a valid UUID.");
}

const seedIds = {
  northstarBusiness: "00000000-0000-4000-8000-000000000001",
  harborBusiness: "00000000-0000-4000-8000-000000000002",
  alexLead: "00000000-0000-4000-8000-000000000101",
  priyaLead: "00000000-0000-4000-8000-000000000102",
  marcoLead: "00000000-0000-4000-8000-000000000103",
  alexSession: "00000000-0000-4000-8000-000000000201",
  priyaSession: "00000000-0000-4000-8000-000000000202",
  marcoSession: "00000000-0000-4000-8000-000000000203",
  northstarDocument: "00000000-0000-4000-8000-000000000301",
  harborDocument: "00000000-0000-4000-8000-000000000302",
  alexVisitor: "00000000-0000-4000-8000-000000000401",
  returningVisitor: "00000000-0000-4000-8000-000000000402",
};

const seedTimestamps = {
  first: "2026-08-10T09:00:00.000Z",
  second: "2026-08-11T10:30:00.000Z",
  third: "2026-08-12T14:15:00.000Z",
  latest: "2026-08-15T08:45:00.000Z",
  expiry: "2026-09-14T08:45:00.000Z",
};

const businesses = [
  {
    id: seedIds.northstarBusiness,
    name: "Northstar Labs",
    slug: "northstar-labs",
    createdAt: seedTimestamps.first,
    updatedAt: seedTimestamps.latest,
  },
  {
    id: seedIds.harborBusiness,
    name: "Harbor & Pine",
    slug: "harbor-and-pine",
    createdAt: seedTimestamps.second,
    updatedAt: seedTimestamps.latest,
  },
];

const leads = [
  {
    id: seedIds.alexLead,
    businessId: seedIds.northstarBusiness,
    name: "Alex Morgan",
    email: "alex.morgan@example.test",
    company: "Orbit Systems",
    role: "Head of Revenue",
    companySize: "51-200",
    useCase: "Qualify inbound demo requests before routing them to sales.",
    budget: "$2,000-$5,000/month",
    timeline: "This quarter",
    productInterest: "Website qualification assistant",
    buyingIntent: "High",
    qualificationStatus: "qualified",
    score: 87,
    scoreBreakdown: {
      fit: 28,
      intent: 31,
      readiness: 28,
    },
    scoreExplanation: "Strong fit with a defined rollout timeline and budget.",
    createdAt: seedTimestamps.first,
    updatedAt: seedTimestamps.latest,
  },
  {
    id: seedIds.priyaLead,
    businessId: seedIds.northstarBusiness,
    name: "Priya Shah",
    email: "priya.shah@example.test",
    company: "Lumen Commerce",
    role: "Growth Manager",
    companySize: "11-50",
    useCase: "Answer product questions for visitors comparing vendors.",
    budget: "$500-$1,000/month",
    timeline: "Next month",
    productInterest: "Product Q&A and lead capture",
    buyingIntent: "Medium",
    qualificationStatus: "qualifying",
    score: 66,
    scoreBreakdown: {
      fit: 24,
      intent: 22,
      readiness: 20,
    },
    scoreExplanation: "Good use case; implementation scope still needs confirmation.",
    createdAt: seedTimestamps.second,
    updatedAt: seedTimestamps.latest,
  },
  {
    id: seedIds.marcoLead,
    businessId: seedIds.harborBusiness,
    name: "Marco Ruiz",
    email: "marco.ruiz@example.test",
    company: "Cedar Finance",
    role: "Customer Experience Lead",
    companySize: "201-500",
    useCase: "Reduce repetitive presales questions for a financial product.",
    budget: "Not decided",
    timeline: "Researching",
    productInterest: "Knowledge-grounded chat",
    buyingIntent: "Low",
    qualificationStatus: "new",
    score: 42,
    scoreBreakdown: {
      fit: 18,
      intent: 12,
      readiness: 12,
    },
    scoreExplanation: "Relevant problem, but timing and budget are still unclear.",
    createdAt: seedTimestamps.third,
    updatedAt: seedTimestamps.third,
  },
];

const sessions = [
  {
    id: seedIds.alexSession,
    businessId: seedIds.northstarBusiness,
    visitorId: seedIds.alexVisitor,
    leadId: seedIds.alexLead,
    status: "completed",
    expiresAt: seedTimestamps.expiry,
    createdAt: seedTimestamps.first,
    updatedAt: seedTimestamps.second,
  },
  {
    id: seedIds.priyaSession,
    businessId: seedIds.northstarBusiness,
    visitorId: seedIds.returningVisitor,
    leadId: seedIds.priyaLead,
    status: "active",
    expiresAt: seedTimestamps.expiry,
    createdAt: seedTimestamps.second,
    updatedAt: seedTimestamps.latest,
  },
  {
    id: seedIds.marcoSession,
    businessId: seedIds.harborBusiness,
    visitorId: seedIds.returningVisitor,
    leadId: seedIds.marcoLead,
    status: "active",
    expiresAt: seedTimestamps.expiry,
    createdAt: seedTimestamps.third,
    updatedAt: seedTimestamps.third,
  },
];

const messages = [
  {
    id: "00000000-0000-4000-8000-000000000501",
    businessId: seedIds.northstarBusiness,
    sessionId: seedIds.alexSession,
    role: "user",
    content: "We need to qualify inbound demo requests before a salesperson follows up.",
    status: "completed",
    createdAt: seedTimestamps.first,
  },
  {
    id: "00000000-0000-4000-8000-000000000502",
    businessId: seedIds.northstarBusiness,
    sessionId: seedIds.alexSession,
    role: "assistant",
    content: "Closer can ask qualification questions, capture the answers, and route the lead with a score.",
    status: "completed",
    inputTokens: 26,
    outputTokens: 22,
    totalTokens: 48,
    provider: "seed",
    model: "development-demo",
    createdAt: seedTimestamps.second,
  },
  {
    id: "00000000-0000-4000-8000-000000000503",
    businessId: seedIds.northstarBusiness,
    sessionId: seedIds.priyaSession,
    role: "user",
    content: "Can it answer questions about our pricing and implementation process?",
    status: "completed",
    createdAt: seedTimestamps.second,
  },
  {
    id: "00000000-0000-4000-8000-000000000504",
    businessId: seedIds.northstarBusiness,
    sessionId: seedIds.priyaSession,
    role: "assistant",
    content: "Yes. Once your approved knowledge documents are available, responses can be grounded in that material.",
    status: "completed",
    inputTokens: 24,
    outputTokens: 23,
    totalTokens: 47,
    provider: "seed",
    model: "development-demo",
    createdAt: seedTimestamps.latest,
  },
  {
    id: "00000000-0000-4000-8000-000000000505",
    businessId: seedIds.harborBusiness,
    sessionId: seedIds.marcoSession,
    role: "user",
    content: "We are still comparing options and have not set a rollout date.",
    status: "completed",
    createdAt: seedTimestamps.third,
  },
  {
    id: "00000000-0000-4000-8000-000000000506",
    businessId: seedIds.harborBusiness,
    sessionId: seedIds.marcoSession,
    role: "assistant",
    content: "That makes sense. I can outline the information you would want ready for a future evaluation.",
    status: "completed",
    inputTokens: 19,
    outputTokens: 21,
    totalTokens: 40,
    provider: "seed",
    model: "development-demo",
    createdAt: seedTimestamps.third,
  },
];

const documents = [
  {
    id: seedIds.northstarDocument,
    businessId: seedIds.northstarBusiness,
    name: "Northstar Labs Product Overview",
    documentType: "markdown",
    sourceUri: "seed://northstar-labs/product-overview",
    status: "ready",
    metadata: {
      source: "development-seed",
      topic: "product",
    },
    createdAt: seedTimestamps.first,
    updatedAt: seedTimestamps.latest,
  },
  {
    id: seedIds.harborDocument,
    businessId: seedIds.harborBusiness,
    name: "Harbor & Pine Qualification Notes",
    documentType: "markdown",
    sourceUri: "seed://harbor-and-pine/qualification-notes",
    status: "ready",
    metadata: {
      source: "development-seed",
      topic: "qualification",
    },
    createdAt: seedTimestamps.third,
    updatedAt: seedTimestamps.third,
  },
];

const chunks = [
  {
    id: "00000000-0000-4000-8000-000000000601",
    businessId: seedIds.northstarBusiness,
    documentId: seedIds.northstarDocument,
    chunkIndex: 0,
    content:
      "Closer helps revenue teams qualify inbound conversations, collect structured lead context, and route promising opportunities.",
    metadata: { section: "overview" },
  },
  {
    id: "00000000-0000-4000-8000-000000000602",
    businessId: seedIds.northstarBusiness,
    documentId: seedIds.northstarDocument,
    chunkIndex: 1,
    content:
      "Teams can prepare approved product and pricing material so future answers remain grounded in their own knowledge base.",
    metadata: { section: "knowledge" },
  },
  {
    id: "00000000-0000-4000-8000-000000000603",
    businessId: seedIds.harborBusiness,
    documentId: seedIds.harborDocument,
    chunkIndex: 0,
    content:
      "A strong qualification conversation identifies the visitor's use case, timeline, expected value, and decision process.",
    metadata: { section: "qualification" },
  },
];

async function seedDatabase(tx) {
  const migrationTable = await tx`
    select to_regclass('drizzle.__drizzle_migrations') as migration_table
  `;

  if (!migrationTable[0]?.migration_table) {
    throw new Error(
      "The Drizzle migration table is missing. Apply the migration before seeding.",
    );
  }

  const migrationRows = await tx`
    select count(*)::int as count from drizzle.__drizzle_migrations
  `;

  if (!migrationRows[0]?.count) {
    throw new Error(
      "No Drizzle migrations are recorded. Apply the migration before seeding.",
    );
  }

  const requiredTables = await tx`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'businesses', 'profiles', 'business_memberships', 'leads',
        'chat_sessions', 'messages', 'knowledge_documents', 'document_chunks'
      )
  `;

  if (requiredTables.length !== 8) {
    throw new Error(
      "The application schema is incomplete. Apply the migration before seeding.",
    );
  }

  for (const business of businesses) {
    await tx`
      insert into businesses (id, name, slug, archived_at, created_at, updated_at)
      values (
        ${business.id}::uuid,
        ${business.name},
        ${business.slug},
        ${null},
        ${business.createdAt},
        ${business.updatedAt}
      )
      on conflict (id) do update set
        name = excluded.name,
        slug = excluded.slug,
        archived_at = excluded.archived_at,
        updated_at = excluded.updated_at
    `;
  }

  let profileSeeded = false;

  if (authUserId) {
    const authUser = await tx`
      select id from auth.users where id = ${authUserId}::uuid
    `;

    if (!authUser[0]) {
      throw new Error(
        "CLOSER_SEED_AUTH_USER_ID does not match an existing auth.users row.",
      );
    }

    await tx`
      insert into profiles (id, full_name, avatar_url, created_at, updated_at)
      values (
        ${authUserId}::uuid,
        ${"Closer Demo Owner"},
        ${null},
        ${seedTimestamps.first},
        ${seedTimestamps.latest}
      )
      on conflict (id) do update set
        full_name = excluded.full_name,
        avatar_url = excluded.avatar_url,
        updated_at = excluded.updated_at
    `;

    for (const business of businesses) {
      await tx`
        insert into business_memberships (business_id, profile_id, role, created_at)
        values (${business.id}::uuid, ${authUserId}::uuid, ${"owner"}, ${business.createdAt})
        on conflict (business_id, profile_id) do update set
          role = excluded.role
      `;
    }

    profileSeeded = true;
  }

  for (const lead of leads) {
    await tx`
      insert into leads (
        id, business_id, name, email, company, role, company_size, use_case,
        budget, timeline, product_interest, buying_intent, qualification_status,
        score, score_breakdown, score_explanation, created_at, updated_at
      )
      values (
        ${lead.id}::uuid,
        ${lead.businessId}::uuid,
        ${lead.name},
        ${lead.email},
        ${lead.company},
        ${lead.role},
        ${lead.companySize},
        ${lead.useCase},
        ${lead.budget},
        ${lead.timeline},
        ${lead.productInterest},
        ${lead.buyingIntent},
        ${lead.qualificationStatus},
        ${lead.score},
        ${client.json(lead.scoreBreakdown)}::jsonb,
        ${lead.scoreExplanation},
        ${lead.createdAt},
        ${lead.updatedAt}
      )
      on conflict (id) do update set
        business_id = excluded.business_id,
        name = excluded.name,
        email = excluded.email,
        company = excluded.company,
        role = excluded.role,
        company_size = excluded.company_size,
        use_case = excluded.use_case,
        budget = excluded.budget,
        timeline = excluded.timeline,
        product_interest = excluded.product_interest,
        buying_intent = excluded.buying_intent,
        qualification_status = excluded.qualification_status,
        score = excluded.score,
        score_breakdown = excluded.score_breakdown,
        score_explanation = excluded.score_explanation,
        updated_at = excluded.updated_at
    `;
  }

  for (const session of sessions) {
    await tx`
      insert into chat_sessions (
        id, business_id, visitor_id, lead_id, status, expires_at, created_at, updated_at
      )
      values (
        ${session.id}::uuid,
        ${session.businessId}::uuid,
        ${session.visitorId}::uuid,
        ${session.leadId}::uuid,
        ${session.status},
        ${session.expiresAt},
        ${session.createdAt},
        ${session.updatedAt}
      )
      on conflict (id) do update set
        business_id = excluded.business_id,
        visitor_id = excluded.visitor_id,
        lead_id = excluded.lead_id,
        status = excluded.status,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    `;
  }

  for (const message of messages) {
    await tx`
      insert into messages (
        id, business_id, session_id, role, content, status, input_tokens,
        output_tokens, total_tokens, provider, model, metadata, error_code, created_at
      )
      values (
        ${message.id}::uuid,
        ${message.businessId}::uuid,
        ${message.sessionId}::uuid,
        ${message.role},
        ${message.content},
        ${message.status},
        ${message.inputTokens ?? null},
        ${message.outputTokens ?? null},
        ${message.totalTokens ?? null},
        ${message.provider ?? null},
        ${message.model ?? null},
        ${client.json({})}::jsonb,
        ${null},
        ${message.createdAt}
      )
      on conflict (id) do update set
        business_id = excluded.business_id,
        session_id = excluded.session_id,
        role = excluded.role,
        content = excluded.content,
        status = excluded.status,
        input_tokens = excluded.input_tokens,
        output_tokens = excluded.output_tokens,
        total_tokens = excluded.total_tokens,
        provider = excluded.provider,
        model = excluded.model,
        metadata = excluded.metadata,
        error_code = excluded.error_code,
        created_at = excluded.created_at
    `;
  }

  for (const document of documents) {
    await tx`
      insert into knowledge_documents (
        id, business_id, created_by_profile_id, name, document_type, source_uri,
        status, metadata, created_at, updated_at
      )
      values (
        ${document.id}::uuid,
        ${document.businessId}::uuid,
        ${authUserId ? authUserId : null}::uuid,
        ${document.name},
        ${document.documentType},
        ${document.sourceUri},
        ${document.status},
        ${client.json(document.metadata)}::jsonb,
        ${document.createdAt},
        ${document.updatedAt}
      )
      on conflict (id) do update set
        business_id = excluded.business_id,
        created_by_profile_id = excluded.created_by_profile_id,
        name = excluded.name,
        document_type = excluded.document_type,
        source_uri = excluded.source_uri,
        status = excluded.status,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `;
  }

  for (const chunk of chunks) {
    await tx`
      insert into document_chunks (
        id, business_id, document_id, chunk_index, content, metadata,
        embedding, embedding_model, created_at
      )
      values (
        ${chunk.id}::uuid,
        ${chunk.businessId}::uuid,
        ${chunk.documentId}::uuid,
        ${chunk.chunkIndex},
        ${chunk.content},
        ${client.json(chunk.metadata)}::jsonb,
        ${null},
        ${null},
        ${seedTimestamps.latest}
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

  return { profileSeeded };
}

const client = postgres(directUrl, {
  max: 1,
  prepare: false,
});

try {
  const result = await client.begin(seedDatabase);

  console.log("Development seed completed.");
  console.log(`Businesses upserted: ${businesses.length}`);
  console.log(`Leads upserted: ${leads.length}`);
  console.log(`Chat sessions upserted: ${sessions.length}`);
  console.log(`Messages upserted: ${messages.length}`);
  console.log(`Knowledge documents upserted: ${documents.length}`);
  console.log(`Document chunks upserted: ${chunks.length}`);

  if (result.profileSeeded) {
    console.log("Existing Auth user profile and memberships upserted.");
  } else {
    console.log(
      "No Auth profile seeded. Set CLOSER_SEED_AUTH_USER_ID to an existing auth.users UUID to add one.",
    );
  }
} catch (error) {
  console.error("Development seed failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
