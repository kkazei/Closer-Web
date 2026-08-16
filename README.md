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
| `HUGGINGFACE_API_KEY` | Hugging Face API key for future embeddings |

> **Note:** Server-only secrets must never be prefixed with `NEXT_PUBLIC_` and must never be imported in client components.

`npm run db:check` performs a read-only `SELECT 1` against both `DATABASE_URL` and `DIRECT_URL`. It does not generate, apply, or inspect migrations. The command requires both variables to contain valid connection strings.

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

The minimal `/login`, `/signup`, and protected `/dashboard` routes are authentication smoke tests. The dashboard displays the verified user identity and memberships but is not the final dashboard or authorization system. The database security foundation is enforced by PostgreSQL RLS and membership-based policies.

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

The current model is `llama-3.3-70b-versatile`. `GROQ_API_KEY` is read only on
the server. Message creation is limited to 20 requests per minute per
session/visitor/network abuse key in the current in-memory limiter. This is a
best-effort free-tier control; a shared limiter is required before scaling
across multiple serverless instances. AI chat currently has no RAG, embedding,
lead extraction, or lead scoring context.

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
> user and assistant messages. Lead scoring, document ingestion, embeddings,
> RAG, distributed rate limiting, and the final dashboard remain future work.
