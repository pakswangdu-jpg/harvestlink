import { useRef, useState } from 'react';
import { ExternalLink, Link2 } from 'lucide-react';
import { normalizeManualLalamoveTrackingUrl } from '../../../backend/shared/lalamove';
import { saveManualLalamoveTrackingLink } from '../../services/lalamoveService';
import Button from '../common/Button';
import CourierDialog from './CourierDialog';

export function ManualLalamoveTrackingLink({ order }) {
  if (order.deliveryMethod !== 'courier') return null;
  const url = normalizeManualLalamoveTrackingUrl(order.manualLalamoveTrackingUrl);
  return url ? (
    <a className="btn btn-secondary btn-sm" href={url} target="_blank" rel="noopener noreferrer">
      <ExternalLink size={15} aria-hidden="true" /> Track on Lalamove
    </a>
  ) : <p className="text-sm text-[var(--muted)]">Waiting for the farmer to provide the Lalamove tracking link.</p>;
}

export function ManageManualLalamoveTracking({ order, onSaved }) {
  const [open, setOpen] = useState(false);
  const [trackingUrl, setTrackingUrl] = useState('');
  const [savedUrl, setSavedUrl] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  if (order.deliveryMethod !== 'courier') return null;
  const title = order.lalamoveQuoteStatus && !order.manualLalamoveTrackingUrl
    ? 'Add Tracking Source Link' : 'Manage Lalamove Tracking';

  const updateLink = async (value) => {
    if (inFlight.current) return;
    setError('');
    setNotice('');
    const normalized = value === null ? null : normalizeManualLalamoveTrackingUrl(value);
    if (value !== null && !normalized) {
      setError('Paste the official HTTPS share link from the Lalamove app.');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await saveManualLalamoveTrackingLink(order.id, normalized);
      setSavedUrl(result.trackingUrl);
      setTrackingUrl(result.trackingUrl || '');
      onSaved(result.trackingUrl);
      setNotice(result.trackingUrl ? 'Tracking link saved.' : 'Tracking link removed.');
    } catch (failure) {
      setError(failure.message || 'Unable to update the tracking link.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="secondary" size="sm" aria-haspopup="dialog" onClick={() => {
        const current = normalizeManualLalamoveTrackingUrl(order.manualLalamoveTrackingUrl);
        setSavedUrl(current);
        setTrackingUrl(current || '');
        setNotice('');
        setError('');
        setOpen(true);
      }}>
        <Link2 size={15} aria-hidden="true" /> {title}
      </Button>
      {open ? (
        <CourierDialog title={title} busy={busy} onClose={() => setOpen(false)}>
          <form className="form-stack lalamove-booking-form" onSubmit={(event) => {
            event.preventDefault();
            void updateLink(trackingUrl);
          }}>
            <p className="lalamove-tracking-note">Book outside HarvestLink, then paste the tracking link from Lalamove’s Share option.</p>
            <label className="form-field">
              <span>Official Lalamove tracking URL</span>
              <input type="url" required maxLength={2048} value={trackingUrl} disabled={busy}
                placeholder="https://share.lalamove.com/…" onChange={(event) => setTrackingUrl(event.target.value)} />
            </label>
            {savedUrl ? (
              <p className="break-all">Saved link <a className="underline" href={savedUrl} target="_blank" rel="noopener noreferrer">{savedUrl}</a></p>
            ) : null}
            {error ? <p className="form-alert error" role="alert">{error}</p> : null}
            {notice ? <p className="form-alert success" role="status">{notice}</p> : null}
            <div className="lalamove-actions">
              <Button type="submit" disabled={busy}>{savedUrl ? 'Update Tracking Link' : 'Save Tracking Link'}</Button>
              {savedUrl ? <Button variant="secondary" disabled={busy} onClick={() => void updateLink(null)}>Remove link</Button> : null}
            </div>
          </form>
        </CourierDialog>
      ) : null}
    </>
  );
}
