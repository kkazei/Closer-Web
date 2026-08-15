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

### Provider credentials reserved for later features
| Variable | Description |
|---|---|
| `GROQ_API_KEY` | Groq API key for future LLM inference |
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

The minimal `/login`, `/signup`, and protected `/dashboard` routes are authentication smoke tests. The dashboard displays the verified user identity and memberships but is not the final dashboard or authorization system. RLS and complete authorization policies are implemented in the following security phase.

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

Authentication is implemented, but membership authorization is not. The current membership helpers are data lookups only; future authenticated callers must derive profile and business context from verified server-side identity, with RLS added separately.

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

> **This is the initial project foundation.** Authentication and a minimal protected-route smoke test are implemented. Core AI, RAG, lead qualification, chat, RLS, and final dashboard features have not yet been implemented.
