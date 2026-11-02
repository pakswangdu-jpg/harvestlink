import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDown, ArrowRight, Package, Sprout,
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

function orderActivityStatus(order) {
  if (['pending', 'rejected', 'cancelled', 'completed'].includes(order.status)) return order.status;
  if (order.status === 'confirmed') {
    if (order.deliveryStatus === 'out_for_delivery') return 'in_transit';
    if (order.deliveryStatus && order.deliveryStatus !== 'pending') return order.deliveryStatus;
    return 'confirmed';
  }
  return order.status;
}

function statusLabel(status) {
  if (status === 'in_transit') return 'In Transit';
  return label(status);
}

export default function OrderContextCard({
  order, orders, recommendationOrder, showRecommendations = false, viewerRole, viewerId,
}) {
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

  const products = recommendationState.farmerId === completedOrder?.farmerId ? recommendationState.products : [];
  const recommendationError = recommendationState.farmerId === completedOrder?.farmerId ? recommendationState.error : '';
  const availableProducts = products.filter((product) => product.status === 'active' && Number(product.quantity) > 0);
  const repeatProduct = availableProducts.find((product) => product.id === completedOrder?.productId);
  const recommendations = availableProducts.filter((product) => product.id !== completedOrder?.productId).slice(0, 2);
  const orderCards = orders || (order ? [order] : []);

  if (!orderCards.length && !isCompletedBuyerOrder) return null;

  return (
    <div className="mx-4 mt-3">
      {orderCards.map((orderItem) => {
        const activityStatus = orderActivityStatus(orderItem);
        const tone = TONE_CLASSES[statusTone(activityStatus === 'in_transit' ? 'out_for_delivery' : activityStatus)] || TONE_CLASSES.neutral;
        const personName = viewerRole === 'farmer' && viewerId === orderItem.farmerId
          ? orderItem.buyerName || 'Buyer'
          : orderItem.farmerFarmName || orderItem.farmerName || 'Farmer';
        return (
          <div key={orderItem.id} className="messages-order-context mb-2 rounded-xl border border-[var(--line)] bg-[var(--soft)] px-3 py-3">
            <div className="messages-order-context-main flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="messages-order-product-image flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--panel)] text-[var(--green-700)]">
                  {orderItem.productImageUrl ? <img src={orderItem.productImageUrl} alt="" className="h-full w-full object-cover" /> : <Package size={18} />}
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Order #{shortOrderId(orderItem.id)}</p>
                  <p className="messages-order-product-name truncate text-[15px] font-semibold text-[var(--text)]">
                    {orderItem.productName} · {orderItem.quantity} {orderItem.unit}
                  </p>
                  <p className="messages-order-product-seller flex flex-wrap items-center gap-x-1.5 text-[12px] text-[var(--muted)]">
                    <span>{formatCurrency(orderItem.totalAmount)} · {personName}</span>
                    <span className={`messages-order-status inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}>
                      {statusLabel(activityStatus)}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
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
