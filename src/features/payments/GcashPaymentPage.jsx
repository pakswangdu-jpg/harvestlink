import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Check, CheckCircle2, Copy, Loader2, ShieldCheck, XCircle,
} from 'lucide-react';
import ZoomableImage from '../../components/common/ZoomableImage';
import BrandWordmark from '../../components/common/BrandWordmark';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import MobileBottomNav from '../../components/layout/MobileBottomNav';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { getGcashCheckout } from '../../services/paymentService';
import { formatCurrency, shortOrderId } from '../../utils/formatters';
import { getNavItemsForRole } from '../../utils/navItemsByRole';
import logo from '../../assets/logo.png';
import gcashLogo from '../../assets/icons/gcash-logo.png';



const COPIED_FEEDBACK_MS = 1500;

const PAYMENT_STEPS = [
  'Open your GCash app.',
  'Scan the QR code.',
  'Confirm the payment amount.',
  'Complete the transaction.',
  'Upload your payment receipt.',
];














export default function GcashPaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { currentUser } = useAuth();
  const navItems = getNavItemsForRole(currentUser.role);


  const [stage, setStage] = useState('loading');
  const [checkout, setCheckout] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);




  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getGcashCheckout(id)
      .then((result) => {
        if (cancelled) return;
        setCheckout(result);
        setStage('ready');
      })
      .catch((error) => {
        if (cancelled) return;



        if (error.message?.toLowerCase().includes('already been paid')) {
          navigate(`/orders/${id}`, { replace: true });
          return;
        }
        setLoadError(error.message || 'Could not load this payment.');
        setStage('error');
      });
    return () => {
      cancelled = true;
    };
  }, [id, navigate, retryToken]);

  const copyGcashNumber = () => {
    if (!checkout?.gcash?.number) return;
    navigator.clipboard?.writeText(checkout.gcash.number).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), COPIED_FEEDBACK_MS);
      showToast({ type: 'success', message: 'GCash number copied.' });
    }).catch(() => {});
  };

  return (
    <main className="gcash-payment-page">
      <div className="gcash-payment-wrap">
        <div className="gcash-payment-header-bar">
          <Link to="/" className="gcash-payment-brand">
            <img src={logo} alt="" />
            <span><BrandWordmark /></span>
          </Link>
          <span className="gcash-secure-indicator"><ShieldCheck size={13} /> <span>Secure Payment</span></span>
        </div>

        <div className="panel gcash-payment-card">
          {stage === 'loading' ? (
            <div className="gcash-payment-status">
              <Loader2 className="animate-spin" size={24} />
              <span>Loading payment details…</span>
            </div>
          ) : null}

          {stage === 'error' ? (
            <div className="gcash-payment-status">
              <XCircle size={28} className="gcash-status-icon error" />
              <p>{loadError}</p>
              <div className="gcash-payment-status-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-md"
                  onClick={() => {
                    setStage('loading');
                    setRetryToken((token) => token + 1);
                  }}
                >
                  Try Again
                </button>
                <Link className="btn btn-secondary btn-md" to="/marketplace">Back to marketplace</Link>
              </div>
            </div>
          ) : null}

          {stage === 'ready' && checkout ? (
            <>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">GCash payment</p>
                  <h2>Order #{shortOrderId(checkout.order.id)}</h2>
                </div>
                <span className="badge badge-pending">Payment pending</span>
              </div>

              <div className="content-grid two gcash-payment-grid">
                <div className="gcash-payment-details">
                  <dl className="gcash-detail-list">
                    <div>
                      <dt>Farmer</dt>
                      <dd>{checkout.order.farmerName}</dd>
                    </div>
                    <div>
                      <dt>GCash account name</dt>
                      <dd>{checkout.gcash.accountName}</dd>
                    </div>
                    {checkout.gcash.number ? (
                      <div>
                        <dt>GCash number</dt>
                        <dd className="gcash-copyable-row">
                          {checkout.gcash.number}
                          <button
                            type="button"
                            className={`gcash-copy-btn${isCopied ? ' is-copied' : ''}`}
                            onClick={copyGcashNumber}
                            aria-label="Copy GCash number"
                          >
                            {isCopied ? <Check size={14} /> : <Copy size={13} />}
                          </button>
                        </dd>
                      </div>
                    ) : null}
                    <div>
                      <dt>Total amount</dt>
                      <dd className="gcash-amount">{formatCurrency(checkout.order.totalAmount)}</dd>
                    </div>
                  </dl>

                  <ol className="gcash-steps">
                    {PAYMENT_STEPS.map((step, index) => (
                      <li key={step}>
                        <span className="gcash-step-index">{index + 1}</span>
                        {step}
                      </li>
                    ))}
                  </ol>

                  <div className="gcash-payment-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-md full-width gcash-upload-receipt-button"
                      onClick={() => navigate(`/orders/${id}/pay/gcash/confirm`)}
                    >
                      <CheckCircle2 size={16} /> Payment Completed — Upload Receipt
                    </button>
                    <button type="button" className="gcash-back-link" onClick={() => setIsLeaveDialogOpen(true)}>
                      <ArrowLeft size={14} /> Back to Order
                    </button>
                  </div>

                  <div className="gcash-status-row">
                    <span className="gcash-status-dot pending" />
                    <div>
                      <strong>Payment Pending</strong>
                      <p>Waiting for payment confirmation.</p>
                    </div>
                  </div>
                </div>

                <div className="gcash-payment-qr-col">
                  <img src={gcashLogo} alt="GCash" className="gcash-payment-qr-logo" />
                  <p className="gcash-scan-label">Scan to Pay</p>
                  <ZoomableImage
                    src={checkout.gcash.qrUrl}
                    alt="GCash QR code"
                    fallbackMessage="Unable to load the GCash QR code. Please contact the seller."
                    className="gcash-payment-qr-image"
                  />
                  <p className="gcash-qr-instruction">Open your GCash app and scan the QR code to pay.</p>
                  <p className="muted gcash-qr-subinstruction">After completing the payment, upload your receipt for verification.</p>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <MobileBottomNav user={currentUser} navItems={navItems} />

      <ConfirmDialog
        open={isLeaveDialogOpen}
        title="Leave this payment page?"
        message="Your order is still waiting for payment. You can come back to this page anytime from your order details."
        confirmLabel="Leave Page"
        cancelLabel="Stay"
        onConfirm={() => navigate(`/orders/${id}`)}
        onCancel={() => setIsLeaveDialogOpen(false)}
      />
    </main>
  );
}
