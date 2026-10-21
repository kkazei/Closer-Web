"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { CloserMark } from "@/app/_components/closer-mark";

type DashboardBusinessOption = Readonly<{
  id: string;
  name: string;
  role: "owner" | "admin" | "member";
}>;

type DashboardShellProps = Readonly<{
  businesses: DashboardBusinessOption[];
  userLabel: string;
  emailVerified: boolean;
  accountMenu: ReactNode;
  verificationReminder: ReactNode;
  children: ReactNode;
}>;

const navigation = [
  { label: "Overview", path: "/dashboard", icon: "overview" },
  { label: "Leads", path: "/dashboard/leads", icon: "leads" },
  { label: "Conversations", path: "/dashboard/conversations", icon: "conversations" },
  { label: "Knowledge", path: "/dashboard/knowledge", icon: "knowledge" },
] as const;

function DashboardNavIcon({
  kind,
}: {
  kind: (typeof navigation)[number]["icon"];
}) {
  switch (kind) {
    case "overview":
      return (
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="5.5" height="5.5" rx="1" />
          <rect x="11.5" y="3" width="5.5" height="5.5" rx="1" />
          <rect x="3" y="11.5" width="5.5" height="5.5" rx="1" />
          <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1" />
        </svg>
      );
    case "leads":
      return (
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="8" cy="6.5" r="3" />
          <path d="M2.75 16.5a5.25 5.25 0 0 1 10.5 0M14 4.25a3 3 0 0 1 0 5.5m1.25 2a4.5 4.5 0 0 1 2 3.75" />
        </svg>
      );
    case "conversations":
      return (
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M3 4.5A2.5 2.5 0 0 1 5.5 2h8A2.5 2.5 0 0 1 16 4.5v4a2.5 2.5 0 0 1-2.5 2.5h-4l-3.75 2.5v-2.5H5.5A2.5 2.5 0 0 1 3 8.5v-4Z" />
          <path d="M8 14h6.5A2.5 2.5 0 0 0 17 11.5v-1" />
        </svg>
      );
    case "knowledge":
      return (
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M3 4.25A1.75 1.75 0 0 1 4.75 2.5H9v14H4.75A1.75 1.75 0 0 0 3 18.25v-14Zm14 0a1.75 1.75 0 0 0-1.75-1.75H11v14h4.25A1.75 1.75 0 0 1 17 18.25v-14Z" />
          <path d="M5.25 5.5H7m7.75 0H13" />
        </svg>
      );
  }
}

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
  emailVerified,
  accountMenu,
  verificationReminder,
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
          <CloserMark />
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
            {!emailVerified ? (
              <span className="dashboard-verification-status">
                Email not verified
              </span>
            ) : null}
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
                  <span className="dashboard-nav-icon"><DashboardNavIcon kind={item.icon} /></span>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="dashboard-sidebar-foot">
            <p>Protected workspace</p>
            <span>Custom session / RLS</span>
          </div>
        </aside>

        <main className="dashboard-content">
          {verificationReminder}
          {children}
        </main>
      </div>
    </div>
  );
}
