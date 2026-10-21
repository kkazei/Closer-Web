import Link from "next/link";

import { CloserMark } from "@/app/_components/closer-mark";
import { APP_NAME } from "@/lib/constants";

export default function HomePage() {
  return (
    <main className="landing-page">
      <div className="landing-ambient" aria-hidden="true">
        <span className="landing-ambient-glow" />
        <span className="landing-ambient-orbit landing-ambient-orbit-outer" />
        <span className="landing-ambient-orbit landing-ambient-orbit-inner" />
      </div>
      <header className="landing-header">
        <Link className="landing-brand" href="/" aria-label="Closer home">
          <CloserMark />
          {APP_NAME}
        </Link>
        <nav className="landing-actions" aria-label="Main navigation">
          <Link className="landing-link" href="/login">Sign in</Link>
          <Link className="landing-button" href="/signup">Create workspace</Link>
        </nav>
      </header>

      <section className="landing-hero" aria-labelledby="landing-heading">
        <div className="landing-copy motion-enter">
          <p className="landing-eyebrow">Knowledge-powered customer chat</p>
          <h1 id="landing-heading">Good questions deserve <span>good answers.</span></h1>
          <p className="landing-intro">
            Closer answers visitor questions from your business knowledge and helps your team follow up with interested leads.
          </p>
          <div className="landing-hero-actions">
            <Link className="landing-button landing-button-large" href="/chat/northstar-fitness">
              Try the live demo
            </Link>
          </div>
          <p className="landing-note">Try the demo without signing in.</p>
        </div>

        <aside className="demo-card motion-enter motion-delay" aria-label="Northstar Fitness chat preview">
          <div className="demo-card-topline">
            <span className="demo-live"><span /> Live demo</span>
          </div>
          <div className="demo-business-heading">
            <div className="demo-business-icon" aria-hidden="true">N</div>
            <div>
              <strong>Northstar Fitness</strong>
              <span>Sample fitness studio</span>
            </div>
          </div>
          <div className="demo-chat-divider" />
          <div className="demo-message demo-message-assistant">
            <span>Closer</span>
            <p>Hi! Ask me about classes, memberships, or visiting the studio.</p>
          </div>
          <div className="demo-message demo-message-visitor">
            <span>You</span>
            <p>How much is a monthly membership?</p>
          </div>
          <div className="demo-message demo-message-assistant">
            <span>Closer</span>
            <p>The unlimited monthly membership is <strong>₱4,500.</strong> Your first class is ₱350.</p>
          </div>
          <p className="demo-source">Source: studio guide</p>
          <Link className="demo-card-cta" href="/chat/northstar-fitness">
            Ask another question
          </Link>
          <p className="demo-card-caption">Answers use Northstar’s sample knowledge.</p>
        </aside>
      </section>

      <section className="landing-how" id="how-it-works" aria-labelledby="how-heading">
        <div className="landing-section-heading">
          <h2 id="how-heading">How it works</h2>
        </div>
        <div className="landing-steps">
          <article className="landing-step">
            <span className="landing-step-number">01</span>
            <h3>Add knowledge</h3>
            <p>Add approved product, pricing, and policy information.</p>
          </article>
          <article className="landing-step">
            <span className="landing-step-number">02</span>
            <h3>Answer questions</h3>
            <p>Guests get answers grounded in relevant business sources.</p>
          </article>
          <article className="landing-step">
            <span className="landing-step-number">03</span>
            <h3>Follow up</h3>
            <p>Review conversations and follow up with interested leads.</p>
          </article>
        </div>
      </section>

      <section className="landing-bottom-cta">
        <h2>Ready for better conversations?</h2>
        <Link className="landing-button landing-button-large" href="/signup">
          Create a workspace
        </Link>
      </section>

      <footer className="landing-footer">
        <Link className="landing-brand landing-brand-footer" href="/">
          <CloserMark />
          Closer
        </Link>
        <span>AI conversations grounded in your business knowledge.</span>
        <Link href="/login">Sign in</Link>
      </footer>
    </main>
  );
}
