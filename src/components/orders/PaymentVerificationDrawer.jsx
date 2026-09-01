import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ExternalLink, FileText, X } from 'lucide-react';
import Button from '../common/Button';
import ZoomableImage from '../common/ZoomableImage';
import PaymentMethodLabel from '../common/PaymentMethodLabel';
import StatusBadge from '../common/StatusBadge';
import { formatCurrency, formatDate, shortOrderId } from '../../utils/formatters';

// A receipt is uploaded as JPG/PNG *or PDF* (see ConfirmGcashPaymentPage's dropzone, which
// accepts all four) — a PDF can never render inside an <img>, which is what made a perfectly
// valid PDF receipt show as "Unable to load this receipt." Those get a file affordance
// instead. The "Open original" link below is offered for every receipt regardless of type, so
// a farmer is never left unable to see the proof of payment they're being asked to approve —
// including when the image itself fails for some other reason (an expired or blocked URL).
function isPdfReceipt(url) {
  return /\.pdf(?:[?#].*)?$/i.test(String(url || ''));
}

// Split out from the drawer shell purely so the parent can give it key={order.id}: remounting
// on a different order resets the reject-in-progress state for free, instead of an effect
// synchronising it (which would half-carry one buyer's typed reason onto another's payment).
function PaymentVerificationContent({ order, onClose, onApprove, onReject }) {
  const [isRejecting, setIsRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const isPdf = isPdfReceipt(order.paymentReceiptUrl);
  // Only a payment the buyer has actually submitted and that is still waiting on this farmer
  // can be approved or rejected. Everything else (COD, an already-settled GCash payment, one
  // the farmer already rejected) opens the same drawer as a read-only payment record.
  const isAwaitingDecision = order.paymentVerificationStatus === 'pending';

  return (
    <>
      <div className="product-drawer-header flex items-start justify-between gap-4 border-b border-[var(--line)] px-8 py-6">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest text-[var(--green-700)]">
            {isAwaitingDecision ? 'Payment verification' : 'Payment information'}
          </p>
          <h2 className="mt-1 text-[28px] font-semibold leading-tight text-[var(--text)]">Order #{shortOrderId(order.id)}</h2>
          <p className="mt-1.5 text-[13px] text-[var(--muted)]">
            {isAwaitingDecision
              ? 'Check the receipt against the details below before approving this payment.'
              : 'Payment record for this order.'}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-[var(--muted)] transition-colors duration-200 hover:bg-[var(--soft)] hover:text-[var(--text)]"
        >
          <X size={20} strokeWidth={2} />
        </button>
      </div>

      <div className="product-drawer-body flex-1 overflow-y-auto px-8 py-8">
        <div className="payment-verification-drawer-grid">
          <div>
            <p className="payment-verification-drawer-label">Receipt</p>
            {!order.paymentReceiptUrl ? (
              /* COD orders never produce one, and a GCash order only has a receipt once the
                 buyer has submitted proof — an <img> pointed at nothing would render as a
                 broken/failed receipt and read like an error that isn't one. */
              <div className="payment-verification-pdf">
                <FileText size={28} aria-hidden="true" />
                <strong>No receipt</strong>
                <span>
                  {order.paymentMethod === 'cod'
                    ? 'Cash on delivery — paid in person.'
                    : 'The buyer has not submitted proof of payment yet.'}
                </span>
              </div>
            ) : isPdf ? (
              <div className="payment-verification-pdf">
                <FileText size={28} aria-hidden="true" />
                <strong>PDF receipt</strong>
                <span>Open it to review the document.</span>
              </div>
            ) : (
              <ZoomableImage
                src={order.paymentReceiptUrl}
                alt={`Payment receipt from ${order.buyerName}`}
                fallbackMessage="Unable to load this receipt — open the original to review it."
                className="payment-verification-receipt-image"
              />
            )}
            {order.paymentReceiptUrl ? (
              <a
                className="payment-verification-receipt-link"
                href={order.paymentReceiptUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={14} aria-hidden="true" /> Open original
              </a>
            ) : null}
          </div>

          <div>
            <p className="payment-verification-drawer-label">Payment details</p>
            <div className="payment-verification-details">
              <div className="ot-detail-row"><span>Buyer</span><strong>{order.buyerName}</strong></div>
              <div className="ot-detail-row"><span>Order #</span><strong>{shortOrderId(order.id)}</strong></div>
              <div className="ot-detail-row"><span>Amount</span><strong>{formatCurrency(order.totalAmount)}</strong></div>
              <div className="ot-detail-row">
                <span>Method</span>
                <strong><PaymentMethodLabel method={order.paymentMethod} /></strong>
              </div>
              <div className="ot-detail-row">
                <span>Payment status</span>
                <strong><StatusBadge value={order.paymentStatus} type="paymentStatus" /></strong>
              </div>
              {order.paymentVerificationStatus ? (
                <div className="ot-detail-row">
                  <span>Verification</span>
                  <strong>
                    <StatusBadge value={order.paymentVerificationStatus} type="paymentVerificationStatus" />
                  </strong>
                </div>
              ) : null}
              <div className="ot-detail-row"><span>Reference #</span><strong>{order.paymentReferenceNumber || '—'}</strong></div>
              <div className="ot-detail-row"><span>Sender name</span><strong>{order.paymentSenderName || '—'}</strong></div>
              <div className="ot-detail-row">
                <span>Submitted</span>
                <strong>{order.paymentSubmittedAt ? formatDate(order.paymentSubmittedAt) : '—'}</strong>
              </div>
              {order.paymentNotes ? (
                <div className="ot-detail-row"><span>Notes</span><strong>{order.paymentNotes}</strong></div>
              ) : null}
            </div>

            {isRejecting && isAwaitingDecision ? (
              <div className="payment-verification-reject-form">
                <label htmlFor="payment-reject-reason">Reason for rejecting</label>
                <textarea
                  id="payment-reject-reason"
                  rows="3"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Tell the buyer what was wrong with this payment"
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="product-drawer-footer flex items-center justify-end gap-2.5 border-t border-[var(--line)] px-8 py-5">
        {!isAwaitingDecision ? (
          <Button variant="secondary" onClick={onClose}>Close</Button>
        ) : isRejecting ? (
          <>
            <Button variant="secondary" onClick={() => { setIsRejecting(false); setReason(''); }}>Cancel</Button>
            <Button variant="danger" disabled={!reason.trim()} onClick={() => onReject(order, reason.trim())}>
              Confirm Reject
            </Button>
          </>
        ) : (
          <>
            <Button variant="danger" onClick={() => setIsRejecting(true)}>
              <X size={15} /> Reject Payment
            </Button>
            <Button onClick={() => onApprove(order)}>
              <Check size={15} /> Approve Payment
            </Button>
          </>
        )}
      </div>
    </>
  );
}

// Right-side slide-over, deliberately reusing .product-drawer-* (ProductDrawer.jsx's chrome)
// rather than restyling a second drawer from scratch — the farmer gets the same open/close
// behaviour and proportions here as the Add Product drawer they already know.
export default function PaymentVerificationDrawer({ order, onClose, onApprove, onReject }) {
  useEffect(() => {
    if (!order) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [order, onClose]);

  return (
    <AnimatePresence>
      {order ? (
        <motion.div
          className="product-drawer-overlay fixed inset-0 z-50 bg-black/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className="product-drawer-panel payment-verification-drawer absolute right-0 top-0 flex h-full w-full max-w-[800px] flex-col bg-[var(--surface-elevated)] shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3, ease: 'easeOut' }}
            onClick={(event) => event.stopPropagation()}
          >
            <PaymentVerificationContent
              key={order.id}
              order={order}
              onClose={onClose}
              onApprove={onApprove}
              onReject={onReject}
            />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
