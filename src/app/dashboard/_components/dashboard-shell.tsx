"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type DashboardBusinessOption = Readonly<{
  id: string;
  name: string;
  role: "owner" | "admin" | "member";
}>;

type DashboardShellProps = Readonly<{
  businesses: DashboardBusinessOption[];
  userLabel: string;
  accountMenu: ReactNode;
  children: ReactNode;
}>;

const navigation = [
  { label: "Overview", path: "/dashboard" },
  { label: "Leads", path: "/dashboard/leads" },
  { label: "Conversations", path: "/dashboard/conversations" },
  { label: "Knowledge", path: "/dashboard/knowledge" },
] as const;

function buildPath(
  path: string,
  businessId: string | undefined,
): string {
  return businessId
    ? `${path}?business=${encodeURIComponent(businessId)}`
    : path;
}

export function DashboardShell({
  businesses,
  userLabel,
  accountMenu,
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedBusinessId =
    searchParams.get("business") ?? businesses[0]?.id;
  const selectedBusiness = businesses.find(
    ({ id }) => id === selectedBusinessId,
  );

  function changeBusiness(businessId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("business", businessId);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="dashboard-app">
      <header className="dashboard-topbar">
        <Link className="dashboard-brand" href={buildPath("/dashboard", selectedBusinessId)}>
          <span className="dashboard-brand-mark" aria-hidden="true">C</span>
          <span>Closer</span>
        </Link>

        <div className="dashboard-topbar-right">
          {businesses.length > 0 ? (
            <label className="dashboard-business-select">
              <span className="sr-only">Business</span>
              <select
                aria-label="Select business"
                value={selectedBusinessId}
                onChange={(event) => changeBusiness(event.target.value)}
              >
                {businesses.map((business) => (
                  <option key={business.id} value={business.id}>
                    {business.name}
                  </option>
                ))}
              </select>
              <span className="dashboard-business-role">
                {selectedBusiness?.role ?? "member"}
              </span>
            </label>
          ) : (
            <span className="dashboard-no-business">No business access</span>
          )}
          <div className="dashboard-account">
            <span className="dashboard-account-name">{userLabel}</span>
            {accountMenu}
          </div>
        </div>
      </header>

      <div className="dashboard-frame">
        <aside className="dashboard-sidebar" aria-label="Dashboard navigation">
          <p className="dashboard-sidebar-label">Workspace</p>
          <nav className="dashboard-nav">
            {navigation.map((item) => {
              const active =
                item.path === "/dashboard"
                  ? pathname === item.path
                  : pathname.startsWith(item.path);

              return (
                <Link
                  className={active ? "dashboard-nav-link active" : "dashboard-nav-link"}
                  href={buildPath(item.path, selectedBusinessId)}
                  key={item.path}
                >
                  <span className="dashboard-nav-rule" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="dashboard-sidebar-foot">
            <p>Protected workspace</p>
            <span>Supabase Auth · RLS</span>
          </div>
        </aside>

        <main className="dashboard-content">{children}</main>
      </div>
    </div>
  );
}
