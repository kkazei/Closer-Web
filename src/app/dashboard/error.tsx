"use client";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="dashboard-page dashboard-error-state">
      <p className="dashboard-eyebrow">Dashboard error</p>
      <h1>We could not load this workspace.</h1>
      <p>
        The request did not complete. Your data and authorization boundaries are unchanged.
      </p>
      <button className="button button-primary" onClick={() => reset()} type="button">
        Try again
      </button>
    </div>
  );
}
