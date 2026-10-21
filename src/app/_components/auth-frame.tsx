import type { ReactNode } from "react";

import Link from "next/link";

import { CloserMark } from "@/app/_components/closer-mark";

export function AuthFrame({
  headline,
  description,
  children,
}: Readonly<{
  headline: string;
  description: string;
  children: ReactNode;
}>) {
  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="About Closer">
        <Link className="auth-story-back" href="/">
          <CloserMark />
          Closer
          <span aria-hidden="true">↗</span>
        </Link>
        <p className="auth-kicker">AI sales workspace</p>
        <h2>{headline}</h2>
        <p>{description}</p>
        <ul className="auth-story-points">
          <li><span className="auth-story-check" aria-hidden="true">✓</span> Answers grounded in your knowledge</li>
          <li><span className="auth-story-check" aria-hidden="true">✓</span> Guest chat for your visitors</li>
          <li><span className="auth-story-check" aria-hidden="true">✓</span> Conversations and leads in one place</li>
        </ul>
      </section>
      <section className="auth-card">{children}</section>
    </main>
  );
}
