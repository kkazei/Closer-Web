import { notFound } from "next/navigation";
import Link from "next/link";

import { getLeadByBusinessId, listChatSessionsByLeadId } from "@/data";

import {
  formatDashboardDateTime,
  NoBusinessState,
  ScoreDisplay,
  SectionHeading,
  StatusPill,
} from "../../_components/dashboard-ui";
import { dashboardHref, getDashboardContext, withDashboardDb } from "../../_lib";

export const dynamic = "force-dynamic";

function readScore(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function DetailField({
  label,
  value,
}: Readonly<{ label: string; value: string | null }>) {
  return (
    <div className="detail-field">
      <dt>{label}</dt>
      <dd>{value?.trim() || "Not provided"}</dd>
    </div>
  );
}

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ business?: string | string[] }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const businessId = typeof query.business === "string" ? query.business : undefined;
  const context = await getDashboardContext(businessId);

  if (!context.business) {
    return <NoBusinessState />;
  }

  const [lead, sessions] = await withDashboardDb(context, () =>
    Promise.all([
      getLeadByBusinessId(context.business!.id, id),
      listChatSessionsByLeadId(context.business!.id, id, { limit: 20 }),
    ]),
  );

  if (!lead) {
    notFound();
  }

  const breakdown = {
    fit: readScore(lead.scoreBreakdown.fit),
    intent: readScore(lead.scoreBreakdown.intent),
    readiness: readScore(lead.scoreBreakdown.readiness),
  };

  return (
    <div className="dashboard-page">
      <div className="dashboard-back-row">
        <Link
          className="text-link"
          href={dashboardHref("/dashboard/leads", context.business.id)}
        >
          Back to leads
        </Link>
      </div>

      <header className="dashboard-page-header detail-header">
        <div>
          <p className="dashboard-eyebrow">Lead record</p>
          <h1>{lead.name || lead.email || "Unnamed lead"}</h1>
          <p className="dashboard-page-intro">
            {lead.company || "Company not provided"} · Added {formatDashboardDateTime(lead.createdAt)}
          </p>
        </div>
        <div className="detail-status-block">
          <StatusPill status={lead.qualificationStatus} />
          <ScoreDisplay score={lead.score} />
        </div>
      </header>

      <div className="dashboard-detail-grid">
        <section className="dashboard-panel">
          <SectionHeading eyebrow="Contact" title="Identity" />
          <dl className="detail-grid">
            <DetailField label="Name" value={lead.name} />
            <DetailField label="Email" value={lead.email} />
            <DetailField label="Company" value={lead.company} />
            <DetailField label="Role" value={lead.role} />
          </dl>
        </section>

        <section className="dashboard-panel">
          <SectionHeading eyebrow="Qualification" title="Buying context" />
          <dl className="detail-grid">
            <DetailField label="Company size" value={lead.companySize} />
            <DetailField label="Use case" value={lead.useCase} />
            <DetailField label="Budget" value={lead.budget} />
            <DetailField label="Timeline" value={lead.timeline} />
            <DetailField label="Product interest" value={lead.productInterest} />
            <DetailField label="Buying intent" value={lead.buyingIntent} />
          </dl>
        </section>

        <section className="dashboard-panel dashboard-panel-wide">
          <SectionHeading eyebrow="Deterministic qualification" title="Score breakdown" />
          <div className="breakdown-list">
            <ScoreBreakdownRow label="Fit" max={35} value={breakdown.fit} />
            <ScoreBreakdownRow label="Intent" max={35} value={breakdown.intent} />
            <ScoreBreakdownRow label="Readiness" max={30} value={breakdown.readiness} />
          </div>
          {lead.scoreExplanation ? (
            <p className="score-explanation">{lead.scoreExplanation}</p>
          ) : null}
        </section>

        <section className="dashboard-panel dashboard-panel-wide">
          <SectionHeading eyebrow="Conversation record" title="Associated conversations" />
          {sessions.length === 0 ? (
            <p className="dashboard-muted">No conversation is associated with this lead.</p>
          ) : (
            <ul className="dashboard-list">
              {sessions.map((session) => (
                <li key={session.id}>
                  <Link
                    className="dashboard-list-link"
                    href={dashboardHref(
                      `/dashboard/conversations/${session.id}`,
                      context.business!.id,
                    )}
                  >
                    <span>
                      <strong>{session.status} session</strong>
                      <small>Updated {formatDashboardDateTime(session.updatedAt)}</small>
                    </span>
                    <span className="text-link">Open</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function ScoreBreakdownRow({
  label,
  max,
  value,
}: Readonly<{ label: string; max: number; value: number }>) {
  const percentage = Math.max(0, Math.min((value / max) * 100, 100));

  return (
    <div className="breakdown-row">
      <div className="breakdown-label">
        <span>{label}</span>
        <strong>{value} / {max}</strong>
      </div>
      <div className="score-track" aria-label={`${label}: ${value} out of ${max}`}>
        <span style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
