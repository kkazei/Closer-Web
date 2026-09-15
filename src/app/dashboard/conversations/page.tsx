import Link from "next/link";

import { listChatSessionsByBusinessId } from "@/data";

import {
  EmptyState,
  formatDashboardDateTime,
  NoBusinessState,
  SectionHeading,
} from "../_components/dashboard-ui";
import { dashboardHref, getDashboardContext, withDashboardDb } from "../_lib";

export const dynamic = "force-dynamic";

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ business?: string | string[] }>;
}) {
  const params = await searchParams;
  const businessId = typeof params.business === "string" ? params.business : undefined;
  const context = await getDashboardContext(businessId);

  if (!context.business) {
    return <NoBusinessState />;
  }

  const sessions = await withDashboardDb(context, () =>
    listChatSessionsByBusinessId(context.business!.id, { limit: 100 }),
  );

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-header">
        <div>
          <p className="dashboard-eyebrow">{context.business.name}</p>
          <h1>Conversations</h1>
          <p className="dashboard-page-intro">
            Read the visitor conversations that shaped each lead record.
          </p>
        </div>
        <div className="dashboard-page-index" aria-label="Conversation records shown">
          <span>Records shown</span>
          <strong>{String(sessions.length).padStart(2, "0")}</strong>
        </div>
      </header>

      <section className="dashboard-panel">
        <SectionHeading eyebrow="Session history" title="All conversations" />
        {sessions.length === 0 ? (
          <EmptyState
            description="Conversation sessions will appear after visitors begin a chat."
            title="No conversations yet"
          />
        ) : (
          <div className="dashboard-table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th scope="col">Session</th>
                  <th scope="col">Lead</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td>
                      <Link
                        className="dashboard-table-primary"
                        href={dashboardHref(
                          `/dashboard/conversations/${session.id}`,
                          context.business!.id,
                        )}
                      >
                        Open conversation
                      </Link>
                    </td>
                    <td className="dashboard-table-secondary">
                      {session.leadId ? "Associated lead" : "No lead yet"}
                    </td>
                    <td>
                      <span className={`session-status session-${session.status}`}>
                        {session.status}
                      </span>
                    </td>
                    <td className="dashboard-table-secondary">
                      {formatDashboardDateTime(session.createdAt)}
                    </td>
                    <td className="dashboard-table-secondary">
                      {formatDashboardDateTime(session.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
