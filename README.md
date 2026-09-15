# Closer

AI-powered sales assistant that qualifies leads through intelligent conversation. Closer answers product questions using RAG, conversationally qualifies website visitors, extracts structured lead information, calculates deterministic lead scores, and provides a business dashboard.

## Tech Stack

- **Framework:** Next.js (App Router)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS
- **AI SDK:** Vercel AI SDK (`ai`)
- **ORM:** Drizzle ORM
- **Database:** PostgreSQL (Supabase) + pgvector
- **LLM:** Groq API
- **Embeddings:** Hugging Face Inference API (`sentence-transformers/all-MiniLM-L6-v2`)
- **Deployment:** Vercel

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Lint
npm run lint

# TypeScript and reusable unit tests
npm run typecheck
npm run test

# Verify runtime and migration database connections
npm run db:check

# Build for production
npm run build
```

## Environment Setup

```bash
cp .env.example .env.local
```

Then configure the following variables in `.env.local`:

### Supabase client configuration
| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase browser-safe publishable key |

### Server-only configuration
| Variable | Description |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (admin access) |
| `DATABASE_URL` | Supabase pooler URL for runtime application queries |
| `DIRECT_URL` | Supabase direct URL for migrations and administration |

### AI provider configuration
| Variable | Description |
|---|---|
| `GROQ_API_KEY` | Server-only Groq API key for chat generation |
| `HF_TOKEN` | Server-only Hugging Face token with Inference Providers permission |

> **Note:** Server-only secrets must never be prefixed with `NEXT_PUBLIC_` and must never be imported in client components.

`npm run db:check` performs a read-only `SELECT 1` against both `DATABASE_URL` and `DIRECT_URL`. It does not generate, apply, or inspect migrations. The command requires both variables to contain valid connection strings.

## Testing

Closer uses two complementary test layers:

- Jest covers reusable deterministic logic: lead extraction normalization,
  deterministic qualification/scoring, input validation, chunking, RAG context
  construction, and embedding-provider behavior. Run it with `npm run test`.
- Database and provider boundary scripts remain the authoritative integration
  tests. They exercise real PostgreSQL RLS, tenant filtering, Supabase Auth
  identity context, pgvector retrieval, anonymous chat ownership, and the
  Groq/Hugging Face boundaries without replacing them with mocks.

The deterministic RAG evaluation set covers relevant and irrelevant questions,
multiple relevant chunks, ready-document filtering, model mismatch, top-K and
similarity thresholds, tenant isolation, no-result behavior, and
prompt-injection-style retrieved content. The grounded-chat integration test
also verifies that retrieved content is marked untrusted and cannot replace
higher-priority system instructions.

Database fixture suites should be run sequentially because several use the
same seeded businesses while others create temporary rollback-only fixtures.
The live RAG smoke test requires configured server-only `GROQ_API_KEY` and
`HF_TOKEN` values:

```bash
npm run db:check
npm run db:test-authz-helpers
npm run db:test-rls-security
npm run db:test-rag-retrieval
npm run db:test-rag-chat
npm run db:test-rag-chat-live
```

No test writes credentials, embeddings, or fixture data that persists after
its cleanup/rollback boundary.

## Development seed

After applying the initial migration, the development-only seed can be run with an explicit confirmation:

```bash
CLOSER_SEED_MODE=development npm run db:seed -- --confirm-development
```

On PowerShell:

```powershell
$env:CLOSER_SEED_MODE = "development"
npm run db:seed -- --confirm-development
```

The seed uses `DIRECT_URL`, upserts deterministic demo records, and can be run repeatedly. It refuses to run when `NODE_ENV=production`, when the explicit development confirmation is missing, or before a Drizzle migration has been applied. It never creates Supabase Auth users or passwords.

To associate the demo data with an existing Supabase Auth user, provide that user's UUID without exposing a password or service credential:

```powershell
$env:CLOSER_SEED_AUTH_USER_ID = "existing-auth-user-uuid"
$env:CLOSER_SEED_MODE = "development"
npm run db:seed -- --confirm-development
```

Without `CLOSER_SEED_AUTH_USER_ID`, the seed skips `profiles` and `business_memberships` because `profiles.id` must reference a real `auth.users.id`.

## Authentication

Closer uses Supabase Auth with `@supabase/ssr` and cookie-backed sessions. The browser client in `src/lib/supabase/client.ts` uses only the public Supabase URL and publishable key. The server client in `src/lib/supabase/server.ts` reads and writes SSR cookies, while `src/proxy.ts` refreshes sessions before requests reach the application.

Server-side identity is resolved from Supabase's verified `auth.getClaims()` result, not from client-supplied IDs or an unverified `getSession()` user object. After sign-up, application-level provisioning creates an idempotent `profiles` row using the exact `auth.users.id`. It does not store passwords, access tokens, or refresh tokens. Business access is represented separately through `business_memberships`.

The `/login`, `/signup`, and protected `/dashboard` routes use the verified identity and membership context. The dashboard is a server-rendered, tenant-scoped workspace for overview metrics, leads, conversations, and knowledge documents. The database security foundation is enforced by PostgreSQL RLS and membership-based policies.

## RLS and database security

Authenticated application access follows this path:

```text
Supabase Auth
      ↓
Verified getClaims() claims
      ↓
withAuthenticatedDb()
      ↓
Transaction-local authenticated role and auth.uid()
      ↓
business_memberships
      ↓
PostgreSQL RLS
      ↓
Tenant-owned data
```

The normal `db` handle used by the DAL is request-scoped and fails closed
outside `withAuthenticatedDb()`. The `privilegedDb` handle uses the trusted
server connection and is reserved for administrative operations, migrations,
development seed data, and explicit Auth profile provisioning. It must not be
used for ordinary user authorization.

RLS is enabled on `businesses`, `profiles`, `business_memberships`, `leads`,
`chat_sessions`, `messages`, `knowledge_documents`, and `document_chunks`.
Authenticated access is derived from `auth.uid()` and
`business_memberships`; anonymous users have no direct access to these private
tables. The `visitor_id` field groups anonymous sessions but is pseudonymous
data, not an authentication or authorization credential.

## Anonymous chat boundary

`POST /api/chat/session` is the only public anonymous-chat boundary currently
implemented. It accepts JSON in the narrow form
`{ "businessSlug": "northstar-labs" }`. It resolves the slug against an
active business, creates a session with the database's 30-day expiration
default, and returns only the new `sessionId` and `expiresAt`. There is no
public session-read endpoint.

The route generates or reuses the `closer_visitor_id` cookie. The cookie is
`HttpOnly`, `Secure`, `SameSite=Lax`, scoped to `/`, and is treated only as a
pseudonymous grouping identifier. `businessId` and `visitorId` in the request
body are rejected; the server chooses both the database business ID and the
visitor UUID. Invalid or archived businesses return the same safe 404 response.

Session creation is protected by a small in-memory fixed-window limiter keyed
by the request abuse signal, visitor cookie when present, and business slug.
Malformed requests have a separate short-window limit. This uses no paid
service or new environment variable and is appropriate for the current
single-instance/free-tier boundary; in-memory limits are not globally shared
across serverless instances. Before production scale, replace this limiter
with a shared store and add message-level limits. The route uses the existing
trusted `privilegedDb` only through the dedicated server-only public-chat data
function; it does not expose the service-role key or weaken anonymous RLS.

## AI chat boundary

`POST /api/chat` accepts only:

```json
{
  "businessSlug": "northstar-labs",
  "sessionId": "chat-session-uuid",
  "message": "How does this work?"
}
```

The route requires the matching `closer_visitor_id` cookie and verifies the
session, business, active status, and expiration server-side. It loads the
conversation history from the database rather than trusting client-supplied
history, persists the user message, and streams a Groq response as plain text.
After a successful stream, the assistant response and token usage are stored
in `messages`. Expired or cookie-mismatched sessions return a safe 404, and
client-supplied `businessId`, `visitorId`, or message-history fields are not
accepted.

The current model is `openai/gpt-oss-120b`. `GROQ_API_KEY` is read only on
the server. Message creation is limited to 20 requests per minute per
session/visitor/network abuse key in the current in-memory limiter. This is a
best-effort free-tier control; a shared limiter is required before scaling
across multiple serverless instances. After a successful response, AI-002 sends
the server-loaded conversation to a separate structured extraction call. The
result is Zod-validated and normalized before it is merged into the lead
associated with `chat_sessions.lead_id`. If the session has no lead and the
conversation contains a signal, a lead is created and associated with that
session. Missing extraction values never erase previously stored lead values.

The LLM never writes the trusted score or status. Server-side deterministic code
calculates a 0-100 score from fit, intent, and readiness signals, stores the
numeric `score_breakdown`, and derives `qualification_status` and
`score_explanation`. Tenant-scoped knowledge retrieval is implemented below
and is now integrated into the anonymous Groq chat boundary. The authenticated
dashboard reads these stored records through the request-scoped RLS DAL.

## Knowledge ingestion

RAG-001 adds a server-only ingestion operation for plain-text knowledge
documents. It is not exposed as a public anonymous route. The authenticated
dashboard provides an owner/admin form that supplies the business and
document context; the operation verifies that membership in the RLS-aware
request transaction before using the trusted server database handle for the
final chunk write. Members can read knowledge in the dashboard but cannot
initiate ingestion or archive documents.

The pipeline is:

```text
plain text → normalize → paragraph-aware chunks → Hugging Face embeddings →
384-dimensional pgvector chunks → ready
```

It uses `sentence-transformers/all-MiniLM-L6-v2` through Hugging Face's current
router feature-extraction endpoint. `HF_TOKEN` is server-only and is never
stored in document metadata, database rows, logs, or responses. The model's
384-dimensional vectors are validated exactly; invalid dimensions are rejected.

Chunking targets 1,200 characters with a 180-character suffix overlap and a
hard 1,600-character chunk limit. Paragraphs are grouped first, then split at
sentence and word boundaries when oversized. Each document is limited to
100,000 normalized characters and 100 chunks, with a two-minute ingestion
budget and at most two bounded retries for transient provider failures.

Supported input in this phase is plain text only. PDF, DOCX, spreadsheets,
crawling, and OCR are not implemented yet. Retrieval and query embeddings are
documented below; HNSW remains future work.

Documents use the existing lifecycle: `draft` or `failed` → `processing` →
`ready`; archived documents cannot be ingested. Embeddings are generated
before replacing existing chunks. The old chunk set remains intact if
generation fails, while successful re-ingestion atomically replaces all
chunks and marks the document ready. Failed runs mark the document `failed`
without deleting a previous good chunk set.

## Knowledge retrieval and grounded chat

The server-only `retrieveKnowledge` primitive accepts an
explicit business ID and query, embeds the query with the same
`sentence-transformers/all-MiniLM-L6-v2` model used during ingestion, validates
the 384-dimensional result, and performs an exact pgvector cosine-distance
search. The application converts distance to cosine similarity with
`1 - distance`, where `1` means identical direction and `0` means orthogonal
vectors.

Retrieval always applies the requested `business_id` filter, requires the
related document to have `ready` status, and requires the canonical embedding
model. Results are filtered by the initial configurable similarity threshold
of `0.55` and bounded to `1` through `10` chunks, with a default of `5`.
The threshold is an initial conservative value that must be calibrated during
RAG evaluation.

The function uses the request-scoped RLS database handle and therefore must be
called inside `withAuthenticatedDb()` for authenticated application access.
The anonymous `/api/chat` boundary uses a separate trusted server-only adapter
only after the session, visitor cookie, business, and expiration have been
validated. That adapter applies the same explicit tenant filter; it does not
create an anonymous table policy or expose direct chunk access.

## Business dashboard

The protected dashboard is available at `/dashboard` after sign-in. It supports
multiple authorized businesses through a server-validated business selector;
the selected business ID is never treated as proof of access. Every page loads
its records through `withAuthenticatedDb()` and explicit business-scoped DAL
queries, with PostgreSQL RLS providing the database-level defense in depth.

Available views:

- `/dashboard` — lead metrics, recent leads, and recent conversations
- `/dashboard/leads` — status/search/sort filtering and lead detail pages
- `/dashboard/conversations` — tenant-scoped conversation transcripts
- `/dashboard/knowledge` — document status, owner/admin plain-text ingestion,
  and owner/admin archiving

The UI displays stored deterministic lead scores, score breakdowns, and
explanations. It does not recalculate or trust scores in the browser. Members
have read-only knowledge access; owners and admins can create and archive
documents. Re-ingestion is intentionally not exposed because the current
dashboard does not retain the original source content after submission.

For each chat message, the route retrieves eligible chunks for the validated
session business, builds a bounded context block, and places it below the
higher-priority system instructions. Retrieved text is explicitly treated as
untrusted reference material: it cannot change the assistant's role, reveal
secrets, or override system instructions. The assistant message stores only
safe retrieval metadata (`ragUsed`, `retrievedChunkIds`, and
`retrievalCount`), never embeddings or provider credentials. If no chunk clears
the threshold, the assistant receives a no-results instruction and must not
invent business-specific facts. Retrieval/provider failure returns a generic
server error rather than silently answering without the required knowledge
boundary.

## Data Access Layer

Database access is centralized in the server-only `src/data/` modules:

```text
Next.js server code
        ↓
Data Access Layer
        ↓
Drizzle
        ↓
Supabase PostgreSQL
```

The DAL uses the `server-only` boundary and returns application-facing DTOs rather than raw database rows. Tenant-owned queries require an explicit `businessId` and scope child resources through both their business and parent identifiers. Raw Drizzle queries should not be scattered through routes, Server Components, or services.

The DAL uses the request-scoped RLS transaction for normal user-scoped reads
and writes. Tenant-owned queries still require an explicit `businessId` and
scope child resources through both their business and parent identifiers.
Membership lookups derive from the verified Auth subject, while privileged
database access remains explicit and limited to trusted server operations.

## Project Structure

```
src/
├── app/            # Next.js App Router (pages, layouts, API routes)
├── ai/             # AI provider abstraction layer
├── components/     # Reusable React components
│   └── ui/         # Base UI components
├── db/             # Database layer (Drizzle client + schema)
│   └── schema/     # Drizzle table definitions
├── lib/            # Shared utilities and constants
├── services/       # Business logic services
├── types/          # Shared TypeScript type definitions
└── validators/     # Input validation schemas
```

## Current Status

> **Current foundation status:** Supabase authentication, the typed DAL, the
> request-scoped RLS database context, tenant isolation, and the RLS security
> regression suite are implemented. Anonymous session creation is now available
> through the narrow public boundary above, and Groq streaming chat now persists
> user and assistant messages. Structured lead extraction and deterministic lead
> scoring are now implemented. Plain-text knowledge ingestion and embedding
> persistence are implemented as the RAG-001 server boundary. Tenant-scoped
> retrieval, grounded chat context, and the authenticated business dashboard
> are implemented. Distributed rate limiting remains future work.
