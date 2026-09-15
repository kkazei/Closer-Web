import "server-only";

import { notFound, redirect } from "next/navigation";

import {
  listBusinessesForProfileId,
  type BusinessDTO,
  type MembershipRole,
} from "@/data";
import { withAuthenticatedDb, type Database } from "@/db";
import { getCurrentAuthenticatedUser } from "@/lib/auth/context";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DashboardBusiness = BusinessDTO & {
  role: MembershipRole;
};

export type DashboardContext = Readonly<{
  user: Awaited<ReturnType<typeof getCurrentAuthenticatedUser>> & object;
  businesses: DashboardBusiness[];
  business: DashboardBusiness | null;
}>;

function normalizeSelectedBusinessId(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!UUID_PATTERN.test(value)) {
    notFound();
  }

  return value;
}

export async function getDashboardContext(
  selectedBusinessId?: string,
): Promise<DashboardContext> {
  const user = await getCurrentAuthenticatedUser();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  const businesses = await withAuthenticatedDb(
    { userId: user.userId },
    () => listBusinessesForProfileId(user.userId),
  );

  const dashboardBusinesses = businesses.flatMap((business) => {
    const membership = user.memberships.find(
      (candidate) => candidate.businessId === business.id,
    );

    return membership
      ? [{ ...business, role: membership.role }]
      : [];
  });

  const requestedId = normalizeSelectedBusinessId(selectedBusinessId);

  if (requestedId && !dashboardBusinesses.some(({ id }) => id === requestedId)) {
    notFound();
  }

  const business =
    dashboardBusinesses.find(({ id }) => id === requestedId) ??
    dashboardBusinesses[0] ??
    null;

  return {
    user,
    businesses: dashboardBusinesses,
    business,
  };
}

export function withDashboardDb<T>(
  context: DashboardContext,
  callback: (database: Database) => Promise<T>,
): Promise<T> {
  if (!context.business) {
    throw new Error("A business membership is required.");
  }

  return withAuthenticatedDb({ userId: context.user.userId }, callback);
}

export function dashboardHref(
  path: string,
  businessId: string | undefined,
): string {
  return businessId
    ? `${path}?business=${encodeURIComponent(businessId)}`
    : path;
}

