import { listKnowledgeDocumentsByBusinessId, type DocumentStatus } from "@/data";

import { ArchiveDocumentForm } from "../_components/archive-document-form";
import {
  EmptyState,
  formatDashboardDate,
  NoBusinessState,
  SectionHeading,
} from "../_components/dashboard-ui";
import { KnowledgeCreateForm } from "../_components/knowledge-create-form";
import { getDashboardContext, withDashboardDb } from "../_lib";

export const dynamic = "force-dynamic";

const statusDescription: Record<DocumentStatus, string> = {
  draft: "Not available to retrieval",
  processing: "Embedding generation is in progress",
  ready: "Available to tenant-scoped RAG retrieval",
  failed: "The last ingestion attempt failed",
  archived: "Excluded from retrieval",
};

function statusLabel(status: DocumentStatus): string {
  return status[0].toUpperCase() + status.slice(1);
}

export default async function KnowledgePage({
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

  const business = context.business;
  const documents = await withDashboardDb(context, () =>
    listKnowledgeDocumentsByBusinessId(business.id, { limit: 100 }),
  );
  const canManageKnowledge = business.role === "owner" || business.role === "admin";

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-header">
        <div>
          <p className="dashboard-eyebrow">{business.name}</p>
          <h1>Knowledge</h1>
          <p className="dashboard-page-intro">
            Manage the approved plain-text sources used to ground Closer responses.
          </p>
        </div>
        <div className="dashboard-page-index" aria-label="Knowledge documents shown">
          <span>Documents</span>
          <strong>{String(documents.length).padStart(2, "0")}</strong>
        </div>
      </header>

      {canManageKnowledge ? (
        <section className="dashboard-panel knowledge-create-panel">
          <SectionHeading
            eyebrow="Owner and admin action"
            title="Add a knowledge document"
          />
          <KnowledgeCreateForm businessId={business.id} />
        </section>
      ) : (
        <section className="dashboard-notice">
          <strong>Read-only knowledge access</strong>
          <span>Members can review approved sources. Owners and admins manage ingestion and archiving.</span>
        </section>
      )}

      <section className="dashboard-panel">
        <SectionHeading eyebrow="Source library" title="Documents" />
        {documents.length === 0 ? (
          <EmptyState
            description={
              canManageKnowledge
                ? "Create the first plain-text source to make approved business information available to RAG."
                : "No knowledge documents are available in this workspace."
            }
            title="No knowledge documents yet"
          />
        ) : (
          <div className="knowledge-list">
            {documents.map((document) => (
              <article className="knowledge-row" key={document.id}>
                <div className="knowledge-row-main">
                  <div className="knowledge-row-title">
                    <h3>{document.name}</h3>
                    <span className={`document-status document-${document.status}`}>
                      {statusLabel(document.status)}
                    </span>
                  </div>
                  <p>{statusDescription[document.status]}</p>
                  <dl>
                    <div>
                      <dt>Type</dt>
                      <dd>{document.documentType}</dd>
                    </div>
                    <div>
                      <dt>Updated</dt>
                      <dd>{formatDashboardDate(document.updatedAt)}</dd>
                    </div>
                    <div>
                      <dt>Retrieval</dt>
                      <dd>{document.status === "ready" ? "Ready" : "Not ready"}</dd>
                    </div>
                  </dl>
                </div>
                {canManageKnowledge && document.status !== "archived" && document.status !== "processing" ? (
                  <ArchiveDocumentForm
                    businessId={business.id}
                    documentId={document.id}
                  />
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <p className="dashboard-footnote">
        Plain text is the supported input in this phase. Retrieval uses only documents marked ready; re-ingestion requires supplying the source content again.
      </p>
    </div>
  );
}
