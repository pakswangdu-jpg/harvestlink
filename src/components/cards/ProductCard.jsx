import { Link } from 'react-router-dom';
import {
  ArrowRight, Leaf, MapPin, Package, ShoppingCart, Star, User,
} from 'lucide-react';
import StatusBadge from '../common/StatusBadge';
import { formatCurrency, formatQuantity, titleCase } from '../../utils/formatters';

// Stricter than the farmer-facing LOW_STOCK_THRESHOLD (10 units — "you should restock soon,"
// see utils/constants.js's isLowStock) — a buyer scanning the marketplace only needs a
// warning when a listing is genuinely about to sell out, not on every item that happens to
// be below a farmer's own restock threshold. That aggressive over-warning was one of the
// specific problems with the old card.
const CRITICAL_STOCK_THRESHOLD = 5;

// The marketplace's product listing card — used in the buyer marketplace grid, the buyer
// dashboard's "fresh listings" strip, and (via a caller-supplied `actions` override) the
// public signed-out farmer profile page. No shopping-cart system exists in this app (an
// order is placed directly from the product page, quantity and all) — "Add to Cart" here is
// the real, functional entry point into that same flow, just framed as the quick-buy action
// next to "View Details" the way a buyer would expect from any commerce card.
export default function ProductCard({ product, actions, showStatus = false }) {
  const isDiscounted = Boolean(product.discountPercent);
  const isCriticallyLow = product.quantity > 0 && product.quantity <= CRITICAL_STOCK_THRESHOLD;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[box-shadow,transform] duration-200 hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(16,24,40,0.08)]">
      <Link to={`/products/${product.id}`} className="relative block aspect-[4/3] shrink-0 overflow-hidden bg-green-50">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-green-800">
            <Package size={40} strokeWidth={1.5} />
          </div>
        )}
        {showStatus ? (
          <span className="absolute left-3 top-3">
            <StatusBadge value={product.status} />
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-[13px] font-medium text-gray-500">{titleCase(product.category)}</p>
            <Link to={`/products/${product.id}`} className="focus-visible:outline-none">
              <h3
                title={titleCase(product.name)}
                className="mt-0.5 line-clamp-2 text-[19px] font-bold leading-snug text-gray-900 transition-colors duration-150 hover:text-green-800"
              >
                {titleCase(product.name)}
              </h3>
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-medium text-gray-500">
            <span className="flex min-w-0 items-center gap-1">
              <MapPin size={13} className="shrink-0 text-gray-400" />
              <span className="truncate">{product.location}</span>
            </span>
            {product.farmerName ? (
              <span className="flex min-w-0 items-center gap-1">
                <User size={13} className="shrink-0 text-gray-400" />
                <span className="truncate">{product.farmerName}</span>
              </span>
            ) : null}
            {product.farmerRating != null ? (
              <span className="flex shrink-0 items-center gap-1">
                <Star size={13} className="shrink-0 fill-amber-400 text-amber-400" /> {product.farmerRating.toFixed(1)}
              </span>
            ) : null}
          </div>

          {/* One clean status line instead of a scatter of separate badges — Fresh is the
              baseline signal for any active listing, Verified/Grade only add on when real. */}
          <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-gray-600">
            <span className="flex items-center gap-1 text-green-700">
              <Leaf size={13} className="shrink-0" /> Fresh
            </span>
            {product.farmerVerified ? (
              <>
                <span className="text-gray-300">•</span>
                <span>Verified Farmer</span>
              </>
            ) : null}
            <span className="text-gray-300">•</span>
            <span>Grade {product.grade || 'A'}</span>
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-3 border-t border-gray-100 pt-4">
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-2xl font-bold leading-none text-gray-900">{formatCurrency(product.price)}</span>
              <span className="text-[13px] font-medium text-gray-400">/{product.unit}</span>
              {isDiscounted ? (
                <span className="text-[13px] font-medium text-gray-400 line-through">{formatCurrency(product.originalPrice)}</span>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span className="flex items-center gap-1 text-[13px] font-semibold text-gray-700">
                <Package size={13} className="shrink-0 text-gray-400" /> {formatQuantity(product.quantity)} {product.unit}
              </span>
              {isCriticallyLow ? (
                <span className="text-[13px] font-semibold text-red-600">Only {formatQuantity(product.quantity)} {product.unit} left</span>
              ) : null}
            </div>
          </div>

          {product.sellingType === 'wholesale' && product.moq ? (
            <p className="text-[13px] text-gray-500">Min. order (MOQ): {formatQuantity(product.moq)} {product.unit}</p>
          ) : null}

          {actions || (
            <div className="flex items-center gap-2">
              <Link
                to={`/products/${product.id}`}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 text-[13px] font-semibold text-gray-700 transition-colors duration-200 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 [forced-color-adjust:none]"
              >
                <ShoppingCart size={15} /> Add to Cart
              </Link>
              <Link
                to={`/products/${product.id}`}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 text-[13px] font-semibold text-white transition-colors duration-200 hover:bg-green-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 [forced-color-adjust:none]"
              >
                View Details <ArrowRight size={15} />
              </Link>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
