import Link from "next/link";

import {
  getLeadOverviewByBusinessId,
  listChatSessionsByBusinessId,
  listLeadsByBusinessId,
} from "@/data";

import {
  EmptyState,
  formatDashboardDate,
  MetricCard,
  NoBusinessState,
  ScoreDisplay,
  SectionHeading,
  StatusPill,
} from "./_components/dashboard-ui";
import { dashboardHref, getDashboardContext, withDashboardDb } from "./_lib";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ business?: string | string[] }>;
}) {
  const params = await searchParams;
  const selectedBusinessId =
    typeof params.business === "string" ? params.business : undefined;
  const context = await getDashboardContext(selectedBusinessId);

  if (!context.business) {
    return <NoBusinessState />;
  }

  const data = await withDashboardDb(context, () =>
    Promise.all([
      getLeadOverviewByBusinessId(context.business!.id),
      listLeadsByBusinessId(context.business!.id, { limit: 5 }),
      listChatSessionsByBusinessId(context.business!.id, { limit: 5 }),
    ]),
  );
  const [overview, recentLeads, recentConversations] = data;
  const leadsHref = dashboardHref("/dashboard/leads", context.business.id);

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-header">
        <div>
          <p className="dashboard-eyebrow">{context.business.name}</p>
          <h1>Overview</h1>
          <p className="dashboard-page-intro">
            A current view of qualified demand and the conversations behind it.
          </p>
        </div>
        <div className="dashboard-page-index" aria-label="Current workspace">
          <span>Workspace</span>
          <strong>01</strong>
        </div>
      </header>

      <section className="dashboard-metrics" aria-label="Lead metrics">
        <MetricCard
          detail="All qualification records"
          label="Total leads"
          value={overview.total}
        />
        <MetricCard
          detail="Awaiting more signals"
          label="New leads"
          value={overview.newLeads}
        />
        <MetricCard
          detail="Meets qualification threshold"
          label="Qualified"
          value={overview.qualified}
        />
        <MetricCard
          detail="Score of 70 or higher"
          label="High quality"
          value={overview.highQuality}
        />
        <MetricCard
          detail="Across scored leads"
          label="Average score"
          value={`${overview.averageScore} / 100`}
        />
      </section>

      <div className="dashboard-overview-grid">
        <section className="dashboard-panel dashboard-panel-wide">
          <SectionHeading
            action={
              <Link className="text-link" href={leadsHref}>
                View all leads
              </Link>
            }
            eyebrow="Latest activity"
            title="Recent leads"
          />
          {recentLeads.length === 0 ? (
            <EmptyState
              description="New leads will appear here after a visitor shares a qualification signal."
              title="No leads yet"
            />
          ) : (
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th scope="col">Contact</th>
                    <th scope="col">Status</th>
                    <th scope="col">Score</th>
                    <th scope="col">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLeads.map((lead) => (
                    <tr key={lead.id}>
                      <td>
                        <Link
                          className="dashboard-table-primary"
                          href={dashboardHref(
                            `/dashboard/leads/${lead.id}`,
                            context.business!.id,
                          )}
                        >
                          {lead.name || lead.email || "Unnamed lead"}
                        </Link>
                        <span className="dashboard-table-secondary">
                          {lead.company || "Company not provided"}
                        </span>
                      </td>
                      <td>
                        <StatusPill status={lead.qualificationStatus} />
                      </td>
                      <td>
                        <ScoreDisplay compact score={lead.score} />
                      </td>
                      <td className="dashboard-table-secondary">
                        {formatDashboardDate(lead.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="dashboard-panel">
          <SectionHeading
            action={
              <Link
                className="text-link"
                href={dashboardHref(
                  "/dashboard/conversations",
                  context.business.id,
                )}
              >
                View all
              </Link>
            }
            eyebrow="Conversation record"
            title="Recent conversations"
          />
          {recentConversations.length === 0 ? (
            <EmptyState
              description="Conversation sessions will appear after visitors begin a chat."
              title="No conversations yet"
            />
          ) : (
            <ul className="dashboard-list">
              {recentConversations.map((session) => (
                <li key={session.id}>
                  <Link
                    className="dashboard-list-link"
                    href={dashboardHref(
                      `/dashboard/conversations/${session.id}`,
                      context.business!.id,
                    )}
                  >
                    <span>
                      <strong>
                        {session.leadId
                          ? "Lead conversation"
                          : "Visitor conversation"}
                      </strong>
                      <small>{formatDashboardDate(session.updatedAt)}</small>
                    </span>
                    <span className={`session-status session-${session.status}`}>
                      {session.status}
                    </span>
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
