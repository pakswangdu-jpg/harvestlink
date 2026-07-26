import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, ShieldCheck, Upload, XCircle } from 'lucide-react';
import ZoomableImage from '../../components/common/ZoomableImage';
import { confirmGcashPayment, getGcashCheckout } from '../../services/paymentService';
import { uploadPaymentReceipt } from '../../services/uploadService';
import { formatCurrency, shortOrderId } from '../../utils/formatters';
import logo from '../../assets/logo.png';

// Reached from checkout (src/components/forms/CheckoutForm.jsx -> ProductDetails.jsx) once
// an order already exists in Supabase with paymentMethod: 'gcash' and paymentStatus:
// 'pending'. Shows the farmer's own real GCash account name/number/QR (stored on their
// profile — see Profile.jsx's Payment Information card), and marks the order paid once the
// buyer uploads a receipt. No GCash API integration of any kind — see
// backend/src/controllers/payments.controller.js.
//
// Deliberately doesn't use AppShell — a payment step leaves the merchant's own app chrome
// behind, so this renders as its own full-page, sidebar-free experience instead.
export default function GcashPaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  // 'loading' | 'ready' | 'submitting' | 'success' | 'error'
  const [stage, setStage] = useState('loading');
  const [checkout, setCheckout] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [payError, setPayError] = useState('');
  const [paidOrder, setPaidOrder] = useState(null);
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState('');

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

  const handleReceiptChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPayError('Please choose an image file.');
      return;
    }
    setPayError('');
    setReceiptFile(file);
    setReceiptPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmitPayment = async () => {
    if (!receiptFile) {
      setPayError('Upload your payment receipt before submitting.');
      return;
    }
    setStage('submitting');
    setPayError('');
    try {
      const receiptUrl = await uploadPaymentReceipt(receiptFile, checkout.order.buyerId);
      const order = await confirmGcashPayment(id, receiptUrl);
      setPaidOrder(order);
      setStage('success');
      setTimeout(() => {
        navigate(`/orders/${id}`, { state: { notice: 'Payment submitted — your order is confirmed.' } });
      }, 1800);
    } catch (error) {
      setPayError(error.message || 'Payment could not be submitted.');
      setStage('ready');
    }
  };

  const phase = stage === 'success' ? 'success' : stage === 'loading' || stage === 'error' ? stage : 'checkout';

  return (
    <main className="gcash-payment-page">
      <div className="gcash-payment-wrap">
        <Link to="/" className="gcash-payment-brand">
          <img src={logo} alt="" />
          <span>HarvestLink</span>
        </Link>

        <div className="panel gcash-payment-card">
          {phase === 'loading' ? (
            <div className="gcash-payment-status">
              <Loader2 className="animate-spin" size={24} />
              <span>Loading payment details…</span>
            </div>
          ) : null}

          {phase === 'error' ? (
            <div className="gcash-payment-status">
              <XCircle size={28} className="gcash-status-icon error" />
              <p>{loadError}</p>
              <Link className="btn btn-secondary btn-md" to="/marketplace">Back to marketplace</Link>
            </div>
          ) : null}

          {phase === 'checkout' && checkout ? (
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
                    <p>Open your GCash app and scan the QR code. After completing payment, upload your payment receipt below.</p>
                  </div>

                  {payError ? <div className="form-alert error">{payError}</div> : null}

                  <div className="form-field">
                    <span>Payment receipt</span>
                    {receiptPreviewUrl ? (
                      <div className="gcash-receipt-preview">
                        <img src={receiptPreviewUrl} alt="Payment receipt preview" />
                      </div>
                    ) : null}
                    <label className="btn btn-secondary btn-md gcash-qr-upload-btn full-width">
                      <input type="file" accept="image/*" onChange={handleReceiptChange} />
                      <Upload size={15} /> {receiptFile ? 'Choose a different image' : 'Choose Image'}
                    </label>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary btn-md full-width"
                    onClick={handleSubmitPayment}
                    disabled={stage === 'submitting' || !receiptFile}
                  >
                    {stage === 'submitting' ? 'Submitting…' : 'Submit Payment'}
                  </button>
                </div>

                <div className="gcash-payment-qr-col">
                  <ZoomableImage
                    src={checkout.gcash.qrUrl}
                    alt="GCash QR code"
                    className="gcash-payment-qr-image"
                  />
                  <p className="muted">Scan with your GCash app, or click it to view full size</p>
                </div>
              </div>
            </>
          ) : null}

          {phase === 'success' && paidOrder ? (
            <div className="gcash-payment-status">
              <CheckCircle2 size={28} className="gcash-status-icon success" />
              <p className="gcash-success-title">Payment submitted</p>
              <p className="gcash-amount">{formatCurrency(paidOrder.totalAmount)}</p>
              <p className="muted">Transaction ID: {paidOrder.transactionId}</p>
              <p className="muted">Redirecting to your order…</p>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
