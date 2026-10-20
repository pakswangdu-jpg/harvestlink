import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ExternalLink, FileText, X } from 'lucide-react';
import Button from '../common/Button';
import ZoomableImage from '../common/ZoomableImage';
import PaymentMethodLabel from '../common/PaymentMethodLabel';
import StatusBadge from '../common/StatusBadge';
import { formatCurrency, formatDate, formatTime, shortOrderId } from '../../utils/formatters';
import { canReviewPayment, paymentReviewKey, paymentRejectionReason, receiptPreviewUrl, PAYMENT_REJECTION_REASONS, PAYMENT_REVIEW_CHECKS } from './paymentReview';
import './PaymentVerificationDrawer.css';

function ReviewFields({ rows }) {
  return <dl className="payment-review-fields">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not recorded'}</dd></div>)}</dl>;
}

function PaymentReviewContent({ order, titleId, busy, canReview, onClose, onDecision }) {
  const [checks, setChecks] = useState(() => PAYMENT_REVIEW_CHECKS.map(() => false));
  const [step, setStep] = useState('review');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const confirmationTitle = useRef(null);
  const decisionPending = useRef(false);
  const receiptUrl = receiptPreviewUrl(order.paymentReceiptUrl);
  const isPdf = receiptUrl && /\.pdf(?:[?#].*)?$/i.test(receiptUrl);
  const reviewComplete = Boolean(receiptUrl) && checks.every(Boolean);
  const rejectReason = paymentRejectionReason(category, note);
  const isPending = order.paymentVerificationStatus === 'pending';
  const toggleCheck = (index, checked) => setChecks(current => current.map((value, i) => i === index ? checked : value));
  useEffect(() => {
    if (step !== 'review') confirmationTitle.current?.focus();
  }, [step]);
  const submit = async () => {
    if (decisionPending.current || !canReview || busy || (step === 'approve' && !reviewComplete) || (step === 'reject' && !rejectReason)) return;
    decisionPending.current = true;
    setError('');
    try {
      const success = await onDecision(step, order, rejectReason);
      if (success === false) setError('The payment decision could not be saved. Check the latest payment status and try again.');
    } catch (failure) { setError(failure.message || 'The payment decision could not be saved. Please try again.'); }
    finally { decisionPending.current = false; }
  };
  const returnToReview = () => { setStep('review'); setError(''); };

  return <>
    <header className="payment-review-header">
      <div><p className="payment-review-eyebrow">{isPending ? 'Payment verification' : 'Payment information'}</p>
        <h2 id={titleId}>Order #{shortOrderId(order.id)}</h2>
        <p>{canReview ? 'Check the receipt against the details below before approving this payment.' : 'Payment record for this order.'}</p>
      </div>
      <button type="button" className="payment-review-close" aria-label="Close payment review" title="Close" onClick={onClose} disabled={busy}><X size={20} aria-hidden="true" /></button>
    </header>

    <div className="payment-review-body" aria-busy={busy}>
      {step === 'review' ? <div className="payment-review-grid">
        <section className="payment-review-evidence" aria-label="Uploaded receipt">
          <h3>Receipt</h3>
          {!receiptUrl ? <div className="payment-review-placeholder"><FileText size={24} aria-hidden="true" /><strong>No receipt available</strong><span>{order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'No readable receipt link was submitted.'}</span></div>
            : isPdf ? <div className="payment-review-placeholder"><FileText size={24} aria-hidden="true" /><strong>PDF receipt</strong></div>
              : <ZoomableImage src={receiptUrl} alt={`Payment receipt from ${order.buyerName}`} fallbackMessage="Unable to load this receipt. Open the original to review it." className="payment-review-receipt-image" />}
          {receiptUrl ? <a className="payment-review-original" href={receiptUrl} target="_blank" rel="noopener noreferrer">Open original <ExternalLink size={14} aria-hidden="true" /></a> : null}
        </section>

        <div className="payment-review-information">
          <section className="payment-review-summary" aria-label="Verification summary"><h3>Verification summary</h3><span>Expected amount</span><strong>{formatCurrency(order.totalAmount)}</strong></section>
          <section className="payment-review-group"><h3>Order</h3><ReviewFields rows={[
            ['Buyer', order.buyerName], ['Order number', shortOrderId(order.id)],
          ]} /></section>
          <section className="payment-review-group"><h3>Payment submission</h3><ReviewFields rows={[
            ['Method', <PaymentMethodLabel key="method" method={order.paymentMethod} />],
            ['Reference number', order.paymentReferenceNumber], ['Sender name', order.paymentSenderName],
            ['Submitted', order.paymentSubmittedAt ? `${formatDate(order.paymentSubmittedAt)} \u00b7 ${formatTime(order.paymentSubmittedAt)}` : null],
            ...(order.paymentNotes ? [['Buyer note', order.paymentNotes]] : []),
          ]} /></section>
          <section className="payment-review-group"><h3>Status</h3><ReviewFields rows={[
            ['Payment status', <StatusBadge key="payment" value={order.paymentStatus} type="paymentStatus" />],
            ...(order.paymentVerificationStatus ? [['Verification', <StatusBadge key="verification" value={order.paymentVerificationStatus} type="paymentVerificationStatus" />]] : []),
            ...(order.paymentRejectionReason ? [['Rejection reason', order.paymentRejectionReason]] : []),
          ]} /></section>
          {canReview ? <fieldset className="payment-review-checklist" disabled={busy || !receiptUrl}><legend>Verify before approving</legend>
            {PAYMENT_REVIEW_CHECKS.map((label, index) => <label key={label}><input type="checkbox" checked={checks[index]} onChange={event => toggleCheck(index, event.target.checked)} /><span>{label}</span></label>)}
          </fieldset> : null}
        </div>
      </div> : <section className="payment-review-confirmation" aria-label={step === 'approve' ? 'Confirm payment approval' : 'Confirm payment rejection'}>
        <h3 ref={confirmationTitle} tabIndex={-1}>{step === 'approve' ? 'Approve payment?' : 'Reject this payment?'}</h3>
        <p>{step === 'approve' ? 'Confirm that you have checked the uploaded receipt.' : 'The Buyer will be asked to review or resubmit the payment proof.'}</p>
        <ReviewFields rows={[
          ['Order number', shortOrderId(order.id)], ['Buyer', order.buyerName], ['Expected amount', formatCurrency(order.totalAmount)],
        ]} />
        {step === 'reject' ? <>
          <fieldset className="payment-review-reasons" disabled={busy}><legend>Reason</legend>{PAYMENT_REJECTION_REASONS.map(reason => <label key={reason}><input type="radio" name="payment-rejection-category" value={reason} checked={category === reason} onChange={() => { setCategory(reason); setError(''); }} /><span>{reason}</span></label>)}</fieldset>
          <label className="payment-review-note">{category === 'Other' ? 'Rejection reason' : 'Review note (optional)'}<textarea rows={3} value={note} maxLength={1000} required={category === 'Other'} disabled={busy} onChange={event => { setNote(event.target.value); setError(''); }} /></label>
        </> : null}
      </section>}
      {error ? <p role="alert" className="payment-review-error">{error}</p> : null}
    </div>

    <footer className="payment-review-footer">
      {!canReview ? <><span className="payment-review-readonly">Read-only review</span><Button variant="secondary" onClick={onClose} disabled={busy}>Close</Button></>
        : step === 'review' ? <>
          <Button className="payment-review-reject" variant="secondary" onClick={() => setStep('reject')} disabled={busy}><X size={15} aria-hidden="true" />Reject Payment</Button>
          <Button className="payment-review-approve" onClick={() => setStep('approve')} disabled={busy || !reviewComplete}><Check size={15} aria-hidden="true" />Approve Payment</Button>
        </> : <>
          <Button className="payment-review-cancel" variant="secondary" onClick={returnToReview} disabled={busy}>Cancel</Button>
          <Button className="payment-review-confirm" variant={step === 'reject' ? 'danger' : 'primary'} onClick={submit} disabled={busy || (step === 'approve' ? !reviewComplete : !rejectReason)}>
            {busy ? 'Saving decision...' : step === 'approve' ? 'Approve Payment' : 'Reject Payment'}
          </Button>
        </>}
    </footer>
  </>;
}

export default function PaymentVerificationDrawer({ order, onClose, onApprove, onReject, readOnly = false }) {
  const dialogRef = useRef(null);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const open = Boolean(order);
  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);
  const close = () => { if (!submitting.current) onClose(); };
  const decide = async (action, record, reason) => {
    if (submitting.current || !['approve', 'reject'].includes(action) || !canReviewPayment(record, { readOnly, onApprove, onReject })) return false;
    submitting.current = true;
    setBusy(true);
    try { return await (action === 'approve' ? onApprove(record) : onReject(record, reason)); }
    finally { submitting.current = false; setBusy(false); }
  };
  if (!order) return null;
  return createPortal(<dialog ref={dialogRef} className="payment-review-dialog" aria-labelledby={titleId} aria-busy={busy}
    onCancel={event => { event.preventDefault(); close(); }}
    onKeyDown={event => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      const lightbox = dialogRef.current?.querySelector('.image-lightbox');
      if (lightbox) { event.preventDefault(); lightbox.querySelector('.image-lightbox-close')?.click(); }
    }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    }}>
    <PaymentReviewContent key={paymentReviewKey(order)} order={order} titleId={titleId} busy={busy} canReview={canReviewPayment(order, { readOnly, onApprove, onReject })} onClose={close} onDecision={decide} />
  </dialog>, document.body);
}
