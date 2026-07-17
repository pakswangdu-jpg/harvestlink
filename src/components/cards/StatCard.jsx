export default function StatCard({ label, value, icon, hint }) {
  return (
    <article className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {hint ? <small className="stat-card-hint">{hint}</small> : null}
      </div>
    </article>
  );
}
