import { redirect } from "next/navigation";

import { getBusinessById } from "@/data";
import { withAuthenticatedDb } from "@/db";
import { signOut } from "@/app/auth/actions";
import { getCurrentAuthenticatedUser } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export default async function DashboardSmokeTestPage() {
  const user = await getCurrentAuthenticatedUser();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  const membershipDetails = await withAuthenticatedDb(
    { userId: user.userId },
    () =>
      Promise.all(
        user.memberships.map(async (membership) => ({
          membership,
          business: await getBusinessById(membership.businessId),
        })),
      ),
  );

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-16">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground/50">Closer</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Authenticated area
          </h1>
          <p className="text-sm text-foreground/60">
            This is an authentication smoke test, not the final dashboard.
          </p>
        </div>

        <form action={signOut}>
          <button
            className="rounded-md border border-foreground/20 px-3 py-2 text-sm"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="space-y-3 rounded-xl border border-foreground/10 p-6">
        <h2 className="font-semibold">Verified identity</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-6">
          <dt className="text-foreground/50">User ID</dt>
          <dd className="break-all font-mono">{user.userId}</dd>
          <dt className="text-foreground/50">Email</dt>
          <dd>{user.email ?? "Not present in verified claims"}</dd>
          <dt className="text-foreground/50">Profile</dt>
          <dd>{user.profile ? "Provisioned" : "Not provisioned"}</dd>
        </dl>
      </section>

      <section className="space-y-3 rounded-xl border border-foreground/10 p-6">
        <h2 className="font-semibold">Business memberships</h2>
        {membershipDetails.length === 0 ? (
          <p className="text-sm text-foreground/60">
            No memberships are assigned yet. Use the development seed with
            this Auth user ID to associate the seeded businesses.
          </p>
        ) : (
          <ul className="space-y-3 text-sm">
            {membershipDetails.map(({ membership, business }) => (
              <li
                className="rounded-md border border-foreground/10 p-3"
                key={membership.businessId}
              >
                <p className="font-medium">
                  {business?.name ?? membership.businessId}
                </p>
                <p className="text-foreground/60">
                  {business?.slug ?? "Unknown business"} · {membership.role}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
