import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import ZoomableImage from '../../components/common/ZoomableImage';
import { getGcashCheckout } from '../../services/paymentService';
import { formatCurrency, shortOrderId } from '../../utils/formatters';
import logo from '../../assets/logo.png';

// Reached from checkout (src/components/forms/CheckoutForm.jsx -> ProductDetails.jsx) once
// an order already exists in Supabase with paymentMethod: 'gcash' and paymentStatus:
// 'pending'. Shows the farmer's own real GCash account name/number/QR (stored on their
// profile — see Profile.jsx's Payment Information card) so the buyer can pay in their own
// GCash app, then hands off to ConfirmGcashPaymentPage to collect proof of payment (receipt
// + reference number) once they've actually paid. No GCash API integration of any kind —
// see backend/src/controllers/payments.controller.js.
//
// Deliberately doesn't use AppShell — a payment step leaves the merchant's own app chrome
// behind, so this renders as its own full-page, sidebar-free experience instead.
export default function GcashPaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  // 'loading' | 'ready' | 'error'
  const [stage, setStage] = useState('loading');
  const [checkout, setCheckout] = useState(null);
  const [loadError, setLoadError] = useState('');

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
        // "Already paid" isn't really an error — it happens if a buyer navigates back to
        // this URL after already completing payment (e.g. via the browser back button).
        // Send them straight to tracking instead of showing a scary error screen for it.
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
  }, [id, navigate]);

  return (
    <main className="gcash-payment-page">
      <div className="gcash-payment-wrap">
        <Link to="/" className="gcash-payment-brand">
          <img src={logo} alt="" />
          <span>HarvestLink</span>
        </Link>

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
              <Link className="btn btn-secondary btn-md" to="/marketplace">Back to marketplace</Link>
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
                    <div>
                      <dt>GCash number</dt>
                      <dd>{checkout.gcash.number}</dd>
                    </div>
                    <div>
                      <dt>Total amount</dt>
                      <dd className="gcash-amount">{formatCurrency(checkout.order.totalAmount)}</dd>
                    </div>
                  </dl>

                  <div className="gcash-instructions">
                    <ShieldCheck size={16} />
                    <p>Open your GCash app and scan the QR code. Once you&apos;ve completed the payment there, tap below to upload your receipt for verification.</p>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary btn-md full-width"
                    onClick={() => navigate(`/orders/${id}/pay/gcash/confirm`)}
                  >
                    ✅ I&apos;ve Completed My Payment <ArrowRight size={15} />
                  </button>
                </div>

                <div className="gcash-payment-qr-col">
                  <ZoomableImage
                    src={checkout.gcash.qrUrl}
                    alt="GCash QR code"
                    fallbackMessage="Unable to load the GCash QR code. Please contact the seller."
                    className="gcash-payment-qr-image"
                  />
                  <p className="muted">Scan with your GCash app, or click it to view full size</p>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
