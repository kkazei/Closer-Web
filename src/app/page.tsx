import { APP_NAME, APP_DESCRIPTION } from "@/lib/constants";

const STACK_ITEMS = [
  "Next.js (App Router)",
  "TypeScript",
  "Tailwind CSS",
  "Vercel AI SDK",
  "Drizzle ORM",
  "Supabase / PostgreSQL",
  "pgvector",
  "Groq API",
  "Hugging Face Inference",
] as const;

export default function HomePage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="mx-auto w-full max-w-2xl space-y-10 text-center">
        {/* Logo / Name */}
        <div className="space-y-2">
          <h1 className="text-5xl font-bold tracking-tight">{APP_NAME}</h1>
          <p className="text-lg text-foreground/60">{APP_DESCRIPTION}</p>
        </div>

        {/* Status Indicator */}
        <div className="inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-600 dark:text-green-400">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
          </span>
          System Online
        </div>

        {/* Tech Stack */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-foreground/40">
            Tech Stack
          </h2>
          <div className="flex flex-wrap justify-center gap-2">
            {STACK_ITEMS.map((item) => (
              <span
                key={item}
                className="rounded-md border border-foreground/10 bg-foreground/5 px-3 py-1 text-sm"
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs text-foreground/30">
          Foundation initialized. Core features pending.
        </p>
      </div>
    </main>
  );
}
