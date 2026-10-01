import { formatRelativeTime } from '../../utils/formatters';

const STATUS_META = {
  online: { label: 'Online', dot: 'is-online' },
  offline: { label: 'Offline', dot: 'is-offline' },
  reconnecting: { label: 'Reconnecting…', dot: 'is-reconnecting' },
  'gps-lost': { label: 'GPS Signal Lost', dot: 'is-gps-lost' },
};

function subtitleFor(status, lastUpdatedAt) {
  const relative = lastUpdatedAt ? formatRelativeTime(lastUpdatedAt) : '';
  if (status === 'reconnecting') return 'Attempting to reconnect…';
  if (status === 'offline') return relative ? `Last updated ${relative}` : 'Waiting for driver connection…';
  if (status === 'gps-lost') return relative ? `Last update ${relative}` : 'Waiting for GPS signal…';
  return relative || 'Just now';
}






export default function DriverConnectionBadge({ status, label, lastUpdatedAt, className = '' }) {
  const meta = STATUS_META[status] || { label: 'Waiting…', dot: 'is-reconnecting' };
  return (
    <div className={`driver-connection-badge ${meta.dot} ${className}`.trim()}>
      <span className="driver-connection-dot" aria-hidden="true" />
      <span className="driver-connection-text">
        <strong>{label} {meta.label}</strong>
        <span>{subtitleFor(status, lastUpdatedAt)}</span>
      </span>
    </div>
  );
}
