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
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key |

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

> **This is the initial project foundation.** Core AI, RAG, lead qualification, chat, authentication, and dashboard features have not yet been implemented. The application currently displays a smoke-test page verifying the foundation is operational.
