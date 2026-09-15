import type { ReactNode } from "react";

import { signOut } from "@/app/auth/actions";
import { DashboardShell } from "./_components/dashboard-shell";
import { getDashboardContext } from "./_lib";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const context = await getDashboardContext();
  const userLabel =
    context.user.profile?.fullName?.trim() ||
    context.user.email ||
    "Authenticated user";

  return (
    <DashboardShell
      accountMenu={
        <form action={signOut}>
          <button className="dashboard-signout" type="submit">
            Sign out
          </button>
        </form>
      }
      businesses={context.businesses}
      userLabel={userLabel}
    >
      {children}
    </DashboardShell>
  );
}
