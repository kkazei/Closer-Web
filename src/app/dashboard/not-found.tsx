export default function DashboardNotFound() {
  return (
    <div className="dashboard-page dashboard-error-state">
      <p className="dashboard-eyebrow">Not found</p>
      <h1>This record is not available.</h1>
      <p>
        It may not belong to the selected business, or it may no longer exist.
      </p>
    </div>
  );
}
