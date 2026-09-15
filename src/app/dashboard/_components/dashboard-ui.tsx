import type { ReactNode } from "react";

import Link from "next/link";

import type { LeadStatus } from "@/data";

export function formatDashboardDate(value: Date): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export function formatDashboardDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export function MetricCard({
  label,
  value,
  detail,
}: Readonly<{ label: string; value: string | number; detail: string }>) {
  return (
    <article className="dashboard-metric">
      <p className="dashboard-eyebrow">{label}</p>
      <p className="dashboard-metric-value">{value}</p>
      <p className="dashboard-muted">{detail}</p>
    </article>
  );
}

const statusLabels: Record<LeadStatus, string> = {
  new: "New",
  qualifying: "Qualifying",
  qualified: "Qualified",
  unqualified: "Unqualified",
};

export function StatusPill({ status }: Readonly<{ status: LeadStatus }>) {
  return (
    <span className={`status-pill status-${status}`}>
      {statusLabels[status]}
    </span>
  );
}

export function ScoreDisplay({
  score,
  compact = false,
}: Readonly<{ score: number | null; compact?: boolean }>) {
  const normalizedScore = score === null ? 0 : Math.max(0, Math.min(score, 100));

  return (
    <div className={compact ? "score-display compact" : "score-display"}>
      <div className="score-number">
        <strong>{score === null ? "—" : score}</strong>
        <span>/ 100</span>
      </div>
      {!compact ? (
        <div className="score-track" aria-label={`${score ?? 0} out of 100`}>
          <span style={{ width: `${normalizedScore}%` }} />
        </div>
      ) : null}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  action,
}: Readonly<{ eyebrow?: string; title: string; action?: ReactNode }>) {
  return (
    <div className="dashboard-section-heading">
      <div>
        {eyebrow ? <p className="dashboard-eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  href,
  action,
}: Readonly<{
  title: string;
  description: string;
  href?: string;
  action?: string;
}>) {
  return (
    <div className="dashboard-empty">
      <span className="dashboard-empty-mark" aria-hidden="true" />
      <h3>{title}</h3>
      <p>{description}</p>
      {href && action ? (
        <Link className="button button-secondary" href={href}>
          {action}
        </Link>
      ) : null}
    </div>
  );
}

export function NoBusinessState() {
  return (
    <div className="dashboard-empty dashboard-empty-large">
      <span className="dashboard-empty-mark" aria-hidden="true" />
      <p className="dashboard-eyebrow">Business access</p>
      <h1>No business workspace yet</h1>
      <p>
        Your account is authenticated, but it is not a member of an active
        business. Ask an owner to add your profile before using the dashboard.
      </p>
    </div>
  );
}
