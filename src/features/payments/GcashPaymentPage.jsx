import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Loader2, ShieldCheck, Smartphone, XCircle } from 'lucide-react';
import DemoQrCode from '../../components/payments/DemoQrCode';
import { confirmGcashPayment, getGcashCheckout } from '../../services/paymentService';
import { formatCurrency } from '../../utils/formatters';
import logo from '../../assets/logo.png';

// Tuned to feel real without being tediously slow to sit through in a demo/grading context —
// a genuine GCash redirect has this same "authorizing with your bank" pause.
const PROCESSING_DURATION_MS = 2600;
const SUCCESS_REDIRECT_DELAY_MS = 1800;

// The demo GCash payment page — reached from checkout (src/components/forms/CheckoutForm.jsx
// -> src/features/marketplace/ProductDetails.jsx) once an order already exists in Supabase
// with paymentMethod: 'gcash' and paymentStatus: 'pending'. This page's only job is to
// simulate the GCash payment experience and then call the backend's demo payment module
// (src/services/paymentService.js -> backend/src/controllers/payments.controller.js) to mark
// that same order paid — it never creates or otherwise modifies an order itself.
//
// Deliberately doesn't use AppShell — a real payment redirect leaves the merchant's own app
// chrome behind, so this renders as its own full-page, sidebar-free experience instead.
export default function GcashPaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  // 'loading' | 'ready' | 'processing' | 'success' | 'error'
  const [stage, setStage] = useState('loading');
  const [checkout, setCheckout] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [payError, setPayError] = useState('');
  const [paidOrder, setPaidOrder] = useState(null);

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

  const handlePayNow = () => {
    setStage('processing');
    setPayError('');
    // The simulated "authorizing" delay happens first, client-side; only once it finishes
    // does this actually call the backend to mark the order paid. A real GCash integration
    // would replace this timeout with waiting on GCash's own redirect/webhook instead — the
    // confirmGcashPayment() call after it wouldn't need to change at all.
    setTimeout(async () => {
      try {
        const order = await confirmGcashPayment(id);
        setPaidOrder(order);
        setStage('success');
        setTimeout(() => {
          navigate(`/orders/${id}`, { state: { notice: 'Payment successful — your order is confirmed.' } });
        }, SUCCESS_REDIRECT_DELAY_MS);
      } catch (error) {
        setPayError(error.message || 'Payment could not be completed.');
        setStage('ready');
      }
    }, PROCESSING_DURATION_MS);
  };

  const phase = stage === 'success' ? 'success' : stage === 'loading' || stage === 'error' ? stage : 'checkout';

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-4">
          <img src={logo} alt="" className="w-7 h-7" />
          <span className="text-slate-500 text-sm font-semibold">HarvestLink Checkout</span>
        </Link>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-[#0038a8] to-[#0056d6] px-6 py-5 text-white">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold tracking-tight">GCash</span>
              <ShieldCheck size={20} className="opacity-80" aria-hidden="true" />
            </div>
            <p className="text-xs text-blue-100 mt-1">Secure checkout</p>
          </div>

          <div className="p-6">
            <AnimatePresence mode="wait">
              {phase === 'loading' ? (
                <motion.div key="loading" exit={{ opacity: 0 }} className="py-16 flex flex-col items-center gap-3 text-slate-500">
                  <Loader2 className="animate-spin" size={28} />
                  <span className="text-sm">Loading payment details…</span>
                </motion.div>
              ) : null}

              {phase === 'error' ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-10 flex flex-col items-center gap-3 text-center"
                >
                  <XCircle className="text-red-500" size={36} aria-hidden="true" />
                  <p className="text-slate-700 font-medium">{loadError}</p>
                  <Link className="btn btn-secondary btn-md" to="/marketplace">Back to marketplace</Link>
                </motion.div>
              ) : null}

              {phase === 'checkout' && checkout ? (
                <motion.div key="checkout" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="flex items-center justify-between text-sm text-slate-500 mb-1">
                    <span>Merchant</span>
                    <span className="font-semibold text-slate-800">{checkout.merchantName}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-slate-500 mb-1">
                    <span>Order</span>
                    <span className="font-semibold text-slate-800 text-right">{checkout.order.productName}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-slate-500 mb-4">
                    <span>Reference no.</span>
                    <span className="font-mono text-slate-800">{checkout.referenceNumber}</span>
                  </div>

                  <div className="text-center py-4 border-y border-slate-100">
                    <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Amount to pay</p>
                    <p className="text-3xl font-extrabold text-[#0038a8]">{formatCurrency(checkout.order.totalAmount)}</p>
                  </div>

                  <div className="flex justify-center py-4">
                    <DemoQrCode value={checkout.referenceNumber} />
                  </div>
                  <p className="text-center text-xs text-slate-400 mb-4">
                    Scan with the GCash app, or tap Pay Now below
                  </p>

                  {payError ? <div className="form-alert error mb-3">{payError}</div> : null}

                  <button
                    type="button"
                    onClick={handlePayNow}
                    disabled={stage === 'processing'}
                    className="w-full rounded-xl bg-[#0038a8] hover:bg-[#002d87] disabled:opacity-70 disabled:cursor-not-allowed text-white font-semibold py-3 flex items-center justify-center gap-2 transition-colors"
                  >
                    {stage === 'processing' ? (
                      <>
                        <Loader2 className="animate-spin" size={18} /> Processing payment…
                      </>
                    ) : (
                      <>
                        <Smartphone size={18} /> Pay Now
                      </>
                    )}
                  </button>
                  <p className="text-center text-[11px] text-slate-400 mt-3">
                    For capstone project · GCash Mode
                  </p>
                </motion.div>
              ) : null}

              {phase === 'success' && paidOrder ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-8 flex flex-col items-center gap-3 text-center"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                    className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center"
                  >
                    <CheckCircle2 className="text-green-600" size={36} aria-hidden="true" />
                  </motion.div>
                  <h2 className="text-lg font-bold text-slate-800">Payment Successful</h2>
                  <p className="text-2xl font-extrabold text-[#0038a8]">{formatCurrency(paidOrder.totalAmount)}</p>
                  <div className="text-xs text-slate-500 space-y-1">
                    <p>Transaction ID: <span className="font-mono text-slate-700">{paidOrder.transactionId}</span></p>
                    <p>
                      {paidOrder.paidAt
                        ? new Date(paidOrder.paidAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
                        : ''}
                    </p>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">Redirecting to your order…</p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </main>
  );
}
