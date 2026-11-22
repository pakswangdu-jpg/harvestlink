import { useRef, useState } from 'react';
import { validateManualLalamoveFee, MAX_MANUAL_LALAMOVE_FEE } from '../../../backend/shared/lalamove';
import { LALAMOVE_QUOTE_LABELS, manageLalamoveDeliveryQuote } from '../../services/lalamoveService';
import { formatCurrency } from '../../utils/formatters';
import Button from '../common/Button';
import CourierDialog from './CourierDialog';

export default function LalamoveDeliveryQuote({ order, isFarmer, onUpdated }) {
  const [dialog, setDialog] = useState('');
  const [declineQuotedAt, setDeclineQuotedAt] = useState(null);
  const [fee, setFee] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const inFlight = useRef(false);
  const status = order.lalamoveQuoteStatus;
  const subtotal = Math.round((order.unitPrice * order.quantity + Number.EPSILON) * 100) / 100;
  const canPropose = isFarmer && order.status === 'pending' && ['pending', 'proposed'].includes(status);
  const canRespond = !isFarmer && order.status === 'pending' && status === 'proposed';
  const validFee = fee.trim() !== '' && validateManualLalamoveFee(Number(fee));

  const send = async (action, details) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await manageLalamoveDeliveryQuote(order.id, action, details);
      onUpdated(updated);
      setDialog('');
      setNotice({ propose: 'Delivery quote sent.', accept: 'Total accepted.', decline: 'Quote declined. The order was cancelled.' }[action]);
    } catch (failure) {
      setError(failure.message || 'Unable to update the delivery quote.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="form-stack">
      <p className="font-semibold">{LALAMOVE_QUOTE_LABELS[status]}</p>
      <div className="ot-detail-row"><span>Product subtotal</span><strong>{formatCurrency(subtotal)}</strong></div>
      {status !== 'pending' ? (
        <>
          <div className="ot-detail-row"><span>Farmer-entered Lalamove fee</span><strong>{formatCurrency(order.deliveryFee)}</strong></div>
          <div className="ot-detail-row"><span>{status === 'accepted' ? 'Accepted total' : 'Quoted total'}</span><strong>{formatCurrency(order.lalamoveAcceptedTotal ?? order.totalAmount)}</strong></div>
        </>
      ) : null}
      {notice ? <p className="form-alert success" role="status">{notice}</p> : null}
      {error && !dialog ? <p className="form-alert error" role="alert">{error}</p> : null}
      {canPropose ? (
        <div><Button aria-haspopup="dialog" onClick={() => {
          setError('');
          setFee(status === 'proposed' ? String(order.deliveryFee) : '');
          setDialog('price');
        }}>Set Lalamove Delivery Price</Button></div>
      ) : null}
      {canRespond ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void send('accept', { quotedAt: order.lalamoveQuotedAt })}>Accept Total</Button>
          <Button variant="secondary" disabled={busy} onClick={() => { setError(''); setDeclineQuotedAt(order.lalamoveQuotedAt); setDialog('decline'); }}>Decline Quote</Button>
        </div>
      ) : null}
      {dialog ? (
        <CourierDialog title={dialog === 'price' ? 'Set Lalamove Delivery Price' : 'Decline Lalamove quote?'} busy={busy} onClose={() => setDialog('')}>
          {dialog === 'price' ? (
            <form className="form-stack" onSubmit={(event) => {
              event.preventDefault();
              if (validFee) void send('propose', { fee: Number(fee) });
            }}>
              <p>Product subtotal: {formatCurrency(subtotal)}</p>
              <label className="form-field">
                <span>Delivery fee (PHP)</span>
                <input type="number" inputMode="decimal" min="0" max={MAX_MANUAL_LALAMOVE_FEE} step="0.01" required
                  value={fee} disabled={busy} onChange={(event) => setFee(event.target.value)} />
              </label>
              {validFee ? <p>Proposed total: <strong>{formatCurrency(subtotal + Number(fee))}</strong></p> : null}
              {error ? <p className="form-alert error" role="alert">{error}</p> : null}
              <Button type="submit" disabled={busy || !validFee}>Send Quote</Button>
            </form>
          ) : (
            <div className="form-stack">
              <p>Declining cancels this order. You can place a new order if you want another quote.</p>
              {error ? <p className="form-alert error" role="alert">{error}</p> : null}
              <Button variant="secondary" disabled={busy} onClick={() => void send('decline', { quotedAt: declineQuotedAt })}>Decline and Cancel Order</Button>
            </div>
          )}
        </CourierDialog>
      ) : null}
    </div>
  );
}
