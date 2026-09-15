import Link from "next/link";

import {
  LEAD_SORTS,
  LEAD_STATUSES,
  listLeadsByBusinessId,
  type LeadSort,
  type LeadStatus,
} from "@/data";

import {
  EmptyState,
  formatDashboardDate,
  NoBusinessState,
  ScoreDisplay,
  SectionHeading,
  StatusPill,
} from "../_components/dashboard-ui";
import { dashboardHref, getDashboardContext, withDashboardDb } from "../_lib";

export const dynamic = "force-dynamic";

function readParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readStatus(value: string | undefined): LeadStatus | undefined {
  return value && LEAD_STATUSES.includes(value as LeadStatus)
    ? (value as LeadStatus)
    : undefined;
}

function readSort(value: string | undefined): LeadSort {
  return value && LEAD_SORTS.includes(value as LeadSort)
    ? (value as LeadSort)
    : "recent";
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    business?: string | string[];
    status?: string | string[];
    sort?: string | string[];
    search?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const businessId = readParam(params.business);
  const status = readStatus(readParam(params.status));
  const sort = readSort(readParam(params.sort));
  const search = readParam(params.search)?.trim().slice(0, 100) || undefined;
  const context = await getDashboardContext(businessId);

  if (!context.business) {
    return <NoBusinessState />;
  }

  const leads = await withDashboardDb(context, () =>
    listLeadsByBusinessId(context.business!.id, {
      limit: 100,
      search,
      sort,
      status,
    }),
  );

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-header">
        <div>
          <p className="dashboard-eyebrow">{context.business.name}</p>
          <h1>Leads</h1>
          <p className="dashboard-page-intro">
            Review the signals Closer has extracted from visitor conversations.
          </p>
        </div>
        <div className="dashboard-page-index" aria-label="Lead records shown">
          <span>Records shown</span>
          <strong>{String(leads.length).padStart(2, "0")}</strong>
        </div>
      </header>

      <section className="dashboard-panel dashboard-filter-panel">
        <form className="dashboard-filters" method="get">
          <input name="business" type="hidden" value={context.business.id} />
          <label>
            <span>Status</span>
            <select defaultValue={status ?? ""} name="status">
              <option value="">All statuses</option>
              {LEAD_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value[0].toUpperCase() + value.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Search</span>
            <input
              defaultValue={search ?? ""}
              name="search"
              placeholder="Name, company, or email"
              type="search"
            />
          </label>
          <label>
            <span>Order</span>
            <select defaultValue={sort} name="sort">
              <option value="recent">Most recent</option>
              <option value="score">Highest score</option>
            </select>
          </label>
          <button className="button button-secondary" type="submit">
            Apply filters
          </button>
        </form>
      </section>

      <section className="dashboard-panel">
        <SectionHeading
          eyebrow="Tenant-scoped records"
          title={leads.length === 1 ? "1 lead" : `${leads.length} leads`}
        />
        {leads.length === 0 ? (
          <EmptyState
            description={
              search || status
                ? "No lead matches the current filters."
                : "New lead records will appear after a visitor shares a qualification signal."
            }
            title={search || status ? "No matching leads" : "No leads yet"}
          />
        ) : (
          <div className="dashboard-table-wrap">
            <table className="dashboard-table dashboard-lead-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Company</th>
                  <th scope="col">Email</th>
                  <th scope="col">Status</th>
                  <th scope="col">Score</th>
                  <th scope="col">Created</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <Link
                        className="dashboard-table-primary"
                        href={dashboardHref(
                          `/dashboard/leads/${lead.id}`,
                          context.business!.id,
                        )}
                      >
                        {lead.name || "Unnamed lead"}
                      </Link>
                    </td>
                    <td className="dashboard-table-secondary">
                      {lead.company || "Not provided"}
                    </td>
                    <td className="dashboard-table-secondary">
                      {lead.email || "Not provided"}
                    </td>
                    <td><StatusPill status={lead.qualificationStatus} /></td>
                    <td><ScoreDisplay compact score={lead.score} /></td>
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
    </div>
  );
}
