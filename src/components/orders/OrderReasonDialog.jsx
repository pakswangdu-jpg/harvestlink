import { useEffect, useId, useRef, useState } from 'react';
import Button from '../common/Button';
import './OrderReasonDialog.css';

const REASONS = {
  cancel: ['Changed my mind', 'Delivery issue', 'Ordered by mistake', 'Other'],
  reject: ['Out of stock', 'Cannot fulfill', 'Invalid order', 'Other'],
};

export default function OrderReasonDialog({ open, kind = 'cancel', title, onConfirm, onCancel }) {
  const dialogRef = useRef(null);
  const inFlight = useRef(false);
  const id = useId();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const close = () => {
    if (inFlight.current) return;
    setReason(''); setDetails(''); setError(''); onCancel();
  };
  const submit = async (event) => {
    event.preventDefault();
    if (inFlight.current || !reason || (reason === 'Other' && !details.trim())) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const succeeded = await onConfirm(reason === 'Other' ? `Other: ${details.trim()}` : reason);
      if (succeeded === false) setError('The order could not be updated. Please try again.');
      else { setReason(''); setDetails(''); }
    } catch (failure) { setError(failure.message || 'Unable to update this order.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return (
    <dialog ref={dialogRef} className="order-reason-dialog" aria-labelledby={`${id}-title`} onCancel={(event) => { event.preventDefault(); close(); }}>
      <form onSubmit={submit}>
        <h2 id={`${id}-title`}>{title || (kind === 'reject' ? 'Reject order?' : 'Cancel order?')}</h2>
        <p>This action cannot be undone.</p>
        <label htmlFor={`${id}-reason`}>Reason</label>
        <select id={`${id}-reason`} required value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy}>
          <option value="">Choose a reason</option>
          {REASONS[kind].map((item) => <option key={item}>{item}</option>)}
        </select>
        {reason === 'Other' ? <><label htmlFor={`${id}-details`}>Details</label><textarea id={`${id}-details`} required maxLength={480} rows={3} value={details} onChange={(event) => setDetails(event.target.value)} disabled={busy} /></> : null}
        {error ? <p className="form-alert error" role="alert">{error}</p> : null}
        <div className="order-reason-actions"><Button variant="secondary" onClick={close} disabled={busy}>Keep order</Button><Button type="submit" variant="danger" disabled={busy || !reason || reason === 'Other' && !details.trim()}>{busy ? 'Updating...' : kind === 'reject' ? 'Reject order' : 'Cancel order'}</Button></div>
      </form>
    </dialog>
  );
}
