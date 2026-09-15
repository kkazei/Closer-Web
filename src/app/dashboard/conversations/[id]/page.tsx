import { notFound } from "next/navigation";
import Link from "next/link";

import { getChatSessionByBusinessId, listMessagesBySessionId } from "@/data";

import {
  formatDashboardDateTime,
  NoBusinessState,
  SectionHeading,
} from "../../_components/dashboard-ui";
import { dashboardHref, getDashboardContext, withDashboardDb } from "../../_lib";

export const dynamic = "force-dynamic";

export default async function ConversationDetailPage({
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

  const [session, messages] = await withDashboardDb(context, () =>
    Promise.all([
      getChatSessionByBusinessId(context.business!.id, id),
      listMessagesBySessionId(context.business!.id, id),
    ]),
  );

  if (!session) {
    notFound();
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-back-row">
        <Link
          className="text-link"
          href={dashboardHref("/dashboard/conversations", context.business.id)}
        >
          Back to conversations
        </Link>
      </div>

      <header className="dashboard-page-header detail-header">
        <div>
          <p className="dashboard-eyebrow">Conversation record</p>
          <h1>{session.leadId ? "Lead conversation" : "Visitor conversation"}</h1>
          <p className="dashboard-page-intro">
            Created {formatDashboardDateTime(session.createdAt)} · Updated {formatDashboardDateTime(session.updatedAt)}
          </p>
        </div>
        <div className="session-detail-status">
          <span className={`session-status session-${session.status}`}>
            {session.status}
          </span>
          {session.leadId ? (
            <Link
              className="text-link"
              href={dashboardHref(
                `/dashboard/leads/${session.leadId}`,
                context.business.id,
              )}
            >
              Open associated lead
            </Link>
          ) : null}
        </div>
      </header>

      <section className="dashboard-panel">
        <SectionHeading
          eyebrow={`${messages.length} message${messages.length === 1 ? "" : "s"}`}
          title="Transcript"
        />
        {messages.length === 0 ? (
          <p className="dashboard-muted">No messages are stored for this session.</p>
        ) : (
          <ol className="transcript">
            {messages.map((message) => (
              <li className={`transcript-message transcript-${message.role}`} key={message.id}>
                <div className="transcript-meta">
                  <strong>{message.role === "user" ? "Visitor" : message.role === "assistant" ? "Closer" : "System"}</strong>
                  <time dateTime={message.createdAt.toISOString()}>
                    {formatDashboardDateTime(message.createdAt)}
                  </time>
                </div>
                <p>{message.content}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
