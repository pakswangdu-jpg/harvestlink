export default function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="info-row">
      <span className="info-icon"><Icon size={17} /></span>
      <div>
        <small>{label}</small>
        <strong>{value || 'Not provided'}</strong>
      </div>
    </div>
  );
}
