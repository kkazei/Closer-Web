export default function DashboardLoading() {
  return (
    <div aria-busy="true" className="dashboard-page dashboard-loading">
      <div className="dashboard-loading-heading" />
      <div className="dashboard-loading-metrics">
        {Array.from({ length: 5 }, (_, index) => (
          <div className="dashboard-loading-block" key={index} />
        ))}
      </div>
      <div className="dashboard-loading-panel" />
    </div>
  );
}
