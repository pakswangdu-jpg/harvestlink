import { MapPin } from 'lucide-react';
import Button from './Button';

export default function LocationPermissionNotice({ role, permission, requesting, error, requestPermission }) {
  if (permission === 'checking' || (permission === 'granted' && !error && !requesting)) return null;
  const blocked = permission === 'denied';
  const unsupported = permission === 'unsupported' || permission === 'insecure';
  const description = permission === 'insecure'
    ? 'Open HarvestLink over HTTPS to enable location access on this device.'
    : permission === 'unsupported'
      ? 'This browser does not support device location. Use a browser with location support for live tracking.'
      : blocked
        ? 'Open your browser’s site settings and allow Location for HarvestLink. Turn on device Location Services, then try again.'
        : role === 'farmer'
          ? 'Allow location access to share your current position during deliveries. Choose Precise Location if your device offers it.'
          : 'Allow location access for pickup tracking and current-location address tools. Choose Precise Location if your device offers it.';
  return (
    <section className="location-permission-notice" aria-label="Location access" aria-live="polite">
      <MapPin size={20} aria-hidden="true" />
      <div className="location-permission-copy">
        <strong>{blocked ? 'Location access is blocked' : error ? 'Check your location' : 'Enable your location'}</strong>
        <p>{error || description}</p>
      </div>
      {!unsupported ? (
        <Button size="sm" onClick={requestPermission} disabled={requesting} aria-busy={requesting}>
          {requesting ? 'Checking location…' : blocked || error ? 'Try again' : 'Enable location'}
        </Button>
      ) : null}
    </section>
  );
}
