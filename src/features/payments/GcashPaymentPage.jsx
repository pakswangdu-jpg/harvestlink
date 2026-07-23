import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, CheckCircle2, ExternalLink, Lock, Loader2, RefreshCw, ShieldCheck, Sprout, Truck, XCircle,
} from 'lucide-react';
import { confirmGcashPayment, startGcashCheckout } from '../../services/paymentService';
import { deliveryMethodLabel, formatCurrency, shortOrderId } from '../../utils/formatters';
import logo from '../../assets/logo.png';

const SUCCESS_REDIRECT_DELAY_MS = 1800;
// Long enough to read the order summary, short enough that it still feels immediate —
// matches the brief pause real merchant checkouts (Shopify, PayPal Standard, etc.) take
// before handing off to the payment processor.
const AUTO_REDIRECT_SECONDS = 4;

// Real GCash checkout — reached from checkout (src/components/forms/CheckoutForm.jsx ->
// src/features/marketplace/ProductDetails.jsx) once an order already exists in Supabase with
// paymentMethod: 'gcash' and paymentStatus: 'pending'. This page has two phases on the same
// route, distinguished by the `return` query param PayMongo's own return_url carries:
//   1. First visit (no `return` param): asks the backend to create/reuse a real PayMongo
//      Payment Intent for this order and shows a "Continue to GCash" button that sends the
//      browser to PayMongo's own hosted checkout — the buyer authorizes there with their
//      real GCash account, not on this site.
//   2. Return visit (`?return=1`, set by PayMongo's return_url): asks the backend to confirm
//      the real payment status directly with PayMongo before showing success.
// Deliberately doesn't use AppShell — a real payment redirect leaves the merchant's own app
// chrome behind, so this renders as its own full-page, sidebar-free experience instead.
export default function GcashPaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isReturning = searchParams.get('return') === '1';

  // 'loading' | 'ready' | 'pending' | 'success' | 'error'
  const [stage, setStage] = useState('loading');
  const [checkout, setCheckout] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [paidOrder, setPaidOrder] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(AUTO_REDIRECT_SECONDS);

  const handleAlreadyPaidOrError = (error) => {
    // "Already paid" isn't really an error — it happens if a buyer navigates back to this
    // URL after already completing payment (e.g. via the browser back button), or the
    // webhook already confirmed it before the buyer's own browser returned.
    if (error.message?.toLowerCase().includes('already been paid')) {
      navigate(`/orders/${id}`, { replace: true });
      return;
    }
    setErrorMessage(error.message || 'Something went wrong.');
    setStage('error');
  };

  // Shared continuation for confirmGcashPayment, used both by the initial return-visit
  // effect below (where `stage` is already 'loading' from its initial value) and by the
  // "Check again" button (which sets 'loading' itself first — see checkPaymentStatus).
  const awaitPaymentConfirmation = () => {
    confirmGcashPayment(id)
      .then((order) => {
        setPaidOrder(order);
        setStage('success');
        setTimeout(() => {
          navigate(`/orders/${id}`, { state: { notice: 'Payment successful — your order is confirmed.' } });
        }, SUCCESS_REDIRECT_DELAY_MS);
      })
      .catch((error) => {
        if (error.message?.toLowerCase().includes('already been paid')) {
          handleAlreadyPaidOrError(error);
          return;
        }
        // Not yet confirmed — the buyer may have cancelled in GCash, or the payment is
        // still processing on PayMongo's side. Let them retry rather than treating this
        // as a hard failure.
        setErrorMessage(error.message || 'Payment could not be confirmed yet.');
        setStage('pending');
      });
  };

  const checkPaymentStatus = () => {
    setStage('loading');
    awaitPaymentConfirmation();
  };

  useEffect(() => {
    let cancelled = false;

    if (isReturning) {
      if (!cancelled) awaitPaymentConfirmation();
    } else {
      startGcashCheckout(id)
        .then((result) => {
          if (cancelled) return;
          setCheckout(result);
          setSecondsLeft(AUTO_REDIRECT_SECONDS);
          setStage('ready');
        })
        .catch((error) => {
          if (cancelled) return;
          handleAlreadyPaidOrError(error);
        });
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isReturning]);

  // Auto-advances to PayMongo once the countdown reaches 0 — "Continue to GCash" stays
  // clickable the whole time as an immediate skip for anyone who doesn't want to wait.
  useEffect(() => {
    if (stage !== 'ready' || !checkout) return undefined;
    const interval = setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          clearInterval(interval);
          window.location.href = checkout.redirectUrl;
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [stage, checkout]);

  const handleRetry = () => {
    setStage('loading');
    setErrorMessage('');
    startGcashCheckout(id)
      .then((result) => {
        setCheckout(result);
        setSecondsLeft(AUTO_REDIRECT_SECONDS);
        setStage('ready');
      })
      .catch(handleAlreadyPaidOrError);
  };

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
            <p className="text-xs text-blue-100 mt-1">Secure checkout via PayMongo</p>
          </div>

          <div className="p-6">
            <AnimatePresence mode="wait">
              {stage === 'loading' ? (
                <motion.div key="loading" exit={{ opacity: 0 }} className="py-16 flex flex-col items-center gap-3 text-slate-500">
                  <Loader2 className="animate-spin" size={28} />
                  <span className="text-sm">{isReturning ? 'Confirming your payment…' : 'Preparing secure checkout…'}</span>
                </motion.div>
              ) : null}

              {stage === 'error' ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-10 flex flex-col items-center gap-3 text-center"
                >
                  <XCircle className="text-red-500" size={36} aria-hidden="true" />
                  <p className="text-slate-700 font-medium">{errorMessage}</p>
                  <Link className="btn btn-secondary btn-md" to="/marketplace">Back to marketplace</Link>
                </motion.div>
              ) : null}

              {stage === 'pending' ? (
                <motion.div
                  key="pending"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-10 flex flex-col items-center gap-3 text-center"
                >
                  <AlertTriangle className="text-amber-500" size={36} aria-hidden="true" />
                  <p className="text-slate-700 font-medium">We couldn't confirm your payment yet.</p>
                  <p className="text-slate-500 text-sm">{errorMessage}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={checkPaymentStatus}
                      className="btn btn-secondary btn-md inline-flex items-center gap-1.5"
                    >
                      <RefreshCw size={15} /> Check again
                    </button>
                    <button type="button" onClick={handleRetry} className="btn btn-primary btn-md">
                      Try GCash again
                    </button>
                  </div>
                </motion.div>
              ) : null}

              {stage === 'ready' && checkout ? (
                <motion.div key="checkout" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
                    <span>Order #{shortOrderId(checkout.order.id)}</span>
                    <span>{deliveryMethodLabel(checkout.order.deliveryMethod)}</span>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2.5">
                    <div className="flex items-center gap-2.5 text-sm">
                      <Sprout size={16} className="text-green-600 shrink-0" aria-hidden="true" />
                      <span className="text-slate-600">
                        {checkout.order.quantity} {checkout.order.unit} · {checkout.order.productName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 text-sm">
                      <Truck size={16} className="text-slate-400 shrink-0" aria-hidden="true" />
                      <span className="text-slate-600">Sold by {checkout.order.farmerName}</span>
                    </div>
                  </div>

                  <div className="text-center py-5">
                    <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Amount to pay</p>
                    <p className="text-4xl font-extrabold text-[#0038a8]">{formatCurrency(checkout.order.totalAmount)}</p>
                  </div>

                  <a
                    href={checkout.redirectUrl}
                    className="w-full rounded-xl bg-[#0038a8] hover:bg-[#002d87] text-white font-semibold py-3 flex items-center justify-center gap-2 transition-colors"
                  >
                    <ExternalLink size={18} /> Continue to GCash
                  </a>
                  <p className="text-center text-xs text-slate-400 mt-3">
                    Redirecting automatically in {secondsLeft}s…
                  </p>

                  <div className="flex items-start gap-2 mt-5 pt-4 border-t border-slate-100 text-[11px] text-slate-400">
                    <Lock size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
                    <p>
                      Processed securely by PayMongo, a licensed Philippine payment gateway. HarvestLink never sees or
                      stores your GCash PIN or one-time code — you'll only ever be asked for those on GCash's own page.
                    </p>
                  </div>
                </motion.div>
              ) : null}

              {stage === 'success' && paidOrder ? (
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
