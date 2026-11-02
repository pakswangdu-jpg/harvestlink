import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDown, ArrowRight, CheckCircle2, Package, Sprout, Truck,
} from 'lucide-react';
import { formatCurrency, shortOrderId, statusTone } from '../../utils/formatters';
import { getPublicFarmerProducts } from '../../services/productService';

const TONE_CLASSES = {
  good: 'bg-[var(--green-50)] text-[var(--green-700)]',
  warning: 'bg-[var(--amber-100)] text-[var(--amber-700)]',
  critical: 'bg-[var(--red-100)] text-[var(--red-700)]',
  neutral: 'bg-[var(--soft)] text-[var(--muted)]',
};

function label(value) {
  return String(value || 'pending').replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function deliveryMethodLabel(value) {
  if (value === 'buyer_pickup') return 'Buyer pickup';
  if (value === 'courier') return 'Courier';
  return 'Farmer delivery';
}

export default function OrderContextCard({ order, delivery = null, recommendationOrder, showRecommendations = false }) {
  const [recommendationState, setRecommendationState] = useState({ farmerId: null, products: [], error: '' });
  const isMobile = globalThis.matchMedia?.('(max-width: 767px)').matches ?? false;
  const completedOrder = recommendationOrder || (order?.status === 'completed' ? order : null);
  const isCompletedBuyerOrder = showRecommendations && completedOrder?.status === 'completed' && completedOrder.farmerId;

  useEffect(() => {
    if (!isCompletedBuyerOrder) return undefined;

    let cancelled = false;
    getPublicFarmerProducts(completedOrder.farmerId)
      .then((result) => {
        if (!cancelled) setRecommendationState({ farmerId: completedOrder.farmerId, products: result, error: '' });
      })
      .catch((error) => {
        if (!cancelled) setRecommendationState({
          farmerId: completedOrder.farmerId,
          products: [],
          error: error.message || 'Recommendations could not be loaded.',
        });
      });
    return () => { cancelled = true; };
  }, [isCompletedBuyerOrder, completedOrder?.farmerId]);

  const tone = order ? TONE_CLASSES[statusTone(order.status)] || TONE_CLASSES.neutral : null;
  const products = recommendationState.farmerId === completedOrder?.farmerId ? recommendationState.products : [];
  const recommendationError = recommendationState.farmerId === completedOrder?.farmerId ? recommendationState.error : '';
  const availableProducts = products.filter((product) => product.status === 'active' && Number(product.quantity) > 0);
  const repeatProduct = availableProducts.find((product) => product.id === completedOrder?.productId);
  const recommendations = availableProducts.filter((product) => product.id !== completedOrder?.productId).slice(0, 2);

  if (!order && !isCompletedBuyerOrder) return null;

  return (
    <div className="mx-4 mt-3">
      {order ? (
        <div className="messages-order-context rounded-xl border border-[var(--line)] bg-[var(--soft)] px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="messages-order-product-image flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--panel)] text-[var(--green-700)]">
                {order.productImageUrl ? <img src={order.productImageUrl} alt="" className="h-full w-full object-cover" /> : <Package size={18} />}
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Order #{shortOrderId(order.id)}</p>
                <p className="messages-order-product-name truncate text-[13px] font-semibold text-[var(--text)]">{order.productName} · {order.quantity} {order.unit}</p>
                <p className="messages-order-product-seller text-[12px] text-[var(--muted)]">{formatCurrency(order.totalAmount)} · {order.farmerName || 'Farmer'}</p>
              </div>
            </div>
            <span className={`messages-order-status shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>
              {order.status === 'completed' ? <CheckCircle2 size={15} aria-hidden="true" /> : null}
              {label(order.status)}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--line)] pt-2.5 text-[11px] sm:grid-cols-4">
            <div><p className="text-[var(--muted)]">Order</p><p className="font-semibold text-[var(--text)]">{label(order.status)}</p></div>
            <div><p className="text-[var(--muted)]">Payment</p><p className="font-semibold text-[var(--text)]">{label(order.paymentStatus)}</p></div>
            <div><p className="text-[var(--muted)]">Delivery</p><p className="font-semibold text-[var(--text)]">{label(order.deliveryStatus)}</p></div>
            <div><p className="text-[var(--muted)]">Method</p><p className="font-semibold text-[var(--text)]">{deliveryMethodLabel(order.deliveryMethod)}</p></div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--muted)]">
            <span className="inline-flex items-center gap-1"><Truck size={13} /> Tracking ID: {order.trackingId || 'Not assigned'}</span>
            {delivery?.bookingReference ? <span>Courier booking: {delivery.bookingReference}</span> : null}
            {delivery?.trackingUrl ? <a href={delivery.trackingUrl} target="_blank" rel="noreferrer" className="font-semibold text-[var(--green-700)] hover:underline">Official courier tracking</a> : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {order.deliveryMethod !== 'buyer_pickup' ? (
              <Link to={`/orders/${order.id}`} className="inline-flex items-center rounded-lg border border-[var(--line)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text)] hover:bg-[var(--panel)]">
                Track delivery
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
      {isCompletedBuyerOrder ? (
        <details
          className="messages-buy-again mt-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3"
          aria-label="Product recommendations"
          defaultOpen={!isMobile}
        >
          <summary className="messages-buy-again-mobile-toggle">
            <span>More from {completedOrder.farmerName || 'this farmer'}</span>
            <ArrowDown size={16} aria-hidden="true" />
          </summary>
          <div className="messages-buy-again-content">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-[13px] font-semibold text-[var(--text)]">More from {completedOrder.farmerName || 'this farmer'}</h3>
                <p className="text-[11px] text-[var(--muted)]">Based on your completed order for {completedOrder.productName}</p>
              </div>
              {repeatProduct ? (
                <Link to={`/products/${repeatProduct.id}`} state={{ quantity: completedOrder.quantity }} className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md bg-[var(--green-700)] px-2.5 text-[12px] font-semibold text-white hover:bg-[var(--green-800)]">
                  Buy again <ArrowRight size={13} aria-hidden="true" />
                </Link>
              ) : null}
            </div>
            {recommendationError ? (
              <p className="text-[12px] text-[var(--muted)]" role="status">{recommendationError}</p>
            ) : recommendations.length ? (
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {recommendations.map((product) => (
                  <Link key={product.id} to={`/products/${product.id}`} className="flex min-w-0 items-center gap-2 rounded-lg bg-[var(--soft)] p-2 transition-colors hover:bg-[var(--green-50)]">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--panel)] text-[var(--green-700)]">
                      {product.image ? <img src={product.image} alt="" className="h-full w-full object-cover" /> : <Sprout size={17} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-medium text-[var(--text)]">{product.name}</span>
                      <span className="block text-[11px] text-[var(--muted)]">{formatCurrency(product.price)} / {product.unit}</span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : repeatProduct ? (
              <p className="text-[12px] text-[var(--muted)]">This product is available to order again.</p>
            ) : (
              <p className="text-[12px] text-[var(--muted)]">No active products from this farmer are available right now.</p>
            )}
          </div>
        </details>
      ) : null}
    </div>
  );
}
