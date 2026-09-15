import Link from "next/link";

import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants";

const STACK_ITEMS = [
  "Next.js App Router",
  "Supabase / PostgreSQL",
  "Drizzle ORM",
  "Groq",
  "Hugging Face",
  "pgvector",
] as const;

export default function HomePage() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <Link className="landing-brand" href="/">
          <span className="landing-brand-mark" aria-hidden="true">
            C
          </span>
          {APP_NAME}
        </Link>
        <nav className="landing-actions" aria-label="Account navigation">
          <Link className="landing-link" href="/login">
            Sign in
          </Link>
          <Link className="landing-button" href="/signup">
            Create account
          </Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-kicker">AI sales operations</div>
        <h1>{APP_NAME}</h1>
        <p>{APP_DESCRIPTION}</p>
        <div className="landing-hero-actions">
          <Link className="landing-button landing-button-large" href="/dashboard">
            Open dashboard
          </Link>
          <span className="landing-note">For authenticated business teams</span>
        </div>
      </section>

      <section className="landing-system" aria-labelledby="system-heading">
        <div>
          <p className="landing-kicker">System</p>
          <h2 id="system-heading">One workspace for the next conversation.</h2>
        </div>
        <div className="landing-stack">
          {STACK_ITEMS.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <span>Closer / Business workspace</span>
        <span>Tenant-scoped by design</span>
      </footer>
    </main>
  );
}
