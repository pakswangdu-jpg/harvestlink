import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, CalendarDays, Check, Leaf, MapPin, Package, ShoppingCart, Sprout, Star, User, X,
} from 'lucide-react';
import StatusBadge from '../common/StatusBadge';
import { formatCurrency, formatDate, formatQuantity, titleCase } from '../../utils/formatters';
import { getExpiryStatus, ORDERING_ROLES } from '../../utils/constants';
import { useAuth } from '../../features/auth/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { useToast } from '../../contexts/ToastContext';

// Stricter than the farmer-facing LOW_STOCK_THRESHOLD (10 units — "you should restock soon,"
// see utils/constants.js's isLowStock) — a buyer scanning the marketplace only needs a
// warning when a listing is genuinely about to sell out, not on every item that happens to
// be below a farmer's own restock threshold. That aggressive over-warning was one of the
// specific problems with the old card.
const CRITICAL_STOCK_THRESHOLD = 5;

// Non-permanent — reverts on its own so "Add to Cart" stays clickable for adding more,
// matching how the cart badge itself just keeps incrementing rather than the button locking.
const ADDED_FEEDBACK_MS = 1500;

// The marketplace's product listing card — used in the buyer marketplace grid, the buyer
// dashboard's "fresh listings" strip, and (via a caller-supplied `actions` override) the
// public signed-out farmer profile page. "Add to Cart" adds one unit of this listing to the
// signed-in buyer/stakeholder's cart (see contexts/CartContext.jsx) without leaving this
// page — "View Details" remains the way to open the full checkout form for a specific
// quantity/delivery method.
export default function ProductCard({ product, actions, showStatus = false, className = '' }) {
  const { currentUser } = useAuth();
  const { addItem, removeItem, isInCart } = useCart();
  const { showToast } = useToast();
  const isDiscounted = Boolean(product.discountPercent);
  const expiryStatus = getExpiryStatus(product.expirationDate);
  const isCriticallyLow = product.quantity > 0 && product.quantity <= CRITICAL_STOCK_THRESHOLD;
  const isOutOfStock = !(product.quantity > 0);
  const canAddToCart = ORDERING_ROLES.includes(currentUser?.role);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  // Once this listing is already in the cart — including after coming back from the cart
  // page's "Continue shopping" link — the button switches to a Cancel action instead of
  // silently staying "Add to Cart" with no way to tell it's already there.
  const inCart = isInCart(product.id);

  const handleAddToCart = () => {
    addItem(product.id, product.quantity, 1);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), ADDED_FEEDBACK_MS);
    showToast({
      type: 'success',
      title: 'Added to cart',
      message: `${titleCase(product.name)} was added to your cart.`,
    });
  };

  const handleRemoveFromCart = () => {
    removeItem(product.id);
    showToast({
      type: 'info',
      title: 'Removed from cart',
      message: `${titleCase(product.name)} was removed from your cart.`,
    });
  };

  return (
    <article className={`group product-card flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[box-shadow,transform] duration-200 hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(16,24,40,0.08)] ${className}`.trim()}>
      {/* Fixed px height per breakpoint (not aspect-ratio) so every card's image band is
          identical regardless of the uploaded photo's own dimensions or the card's own width —
          object-cover then crops any portrait/landscape/panoramic source to fill it. */}
      <Link to={`/products/${product.id}`} className="relative block h-[200px] shrink-0 overflow-hidden bg-[var(--green-50)] sm:h-[220px] lg:h-[240px]">
        {product.image && !imageFailed ? (
          <>
            {!imageLoaded ? (
              <div className="absolute inset-0 animate-pulse bg-[var(--soft)]" aria-hidden="true" />
            ) : null}
            <img
              src={product.image}
              alt={product.name}
              loading="lazy"
              decoding="async"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageFailed(true)}
              className={`h-full w-full object-cover object-center transition-opacity duration-300 ease-out ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            />
          </>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-[var(--green-800)]/70">
            <Sprout size={36} strokeWidth={1.5} />
            <span className="text-[12px] font-medium">No image available</span>
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
            <p className="product-card-category text-[13px] font-medium text-[var(--muted)]">{titleCase(product.category)}</p>
            <Link to={`/products/${product.id}`} className="focus-visible:outline-none">
              <h3
                title={titleCase(product.name)}
                className="product-card-name mt-0.5 line-clamp-2 text-[19px] font-semibold leading-snug text-[var(--text)] transition-colors duration-150 hover:text-[var(--green-800)]"
              >
                {titleCase(product.name)}
              </h3>
            </Link>
          </div>

          <div className="product-card-meta flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-medium text-[var(--muted)]">
            <span className="flex min-w-0 items-center gap-1">
              <MapPin size={13} className="shrink-0 text-[var(--muted)]" />
              <span className="truncate">{product.location}</span>
            </span>
            {product.farmerName ? (
              <span className="flex min-w-0 items-center gap-1">
                <User size={13} className="shrink-0 text-[var(--muted)]" />
                <span className="truncate">{product.farmerName}</span>
              </span>
            ) : null}
            {product.farmerRating != null ? (
              <span className="flex shrink-0 items-center gap-1">
                <Star size={13} className="shrink-0 fill-[var(--amber-700)] text-[var(--amber-700)]" /> {product.farmerRating.toFixed(1)}
              </span>
            ) : null}
          </div>

          {/* One clean status line instead of a scatter of separate badges — Fresh is the
              baseline signal for any active listing, Verified/Grade only add on when real. */}
          <div className="product-card-trust flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-[var(--text-secondary)]">
            <span className="flex items-center gap-1 text-[var(--green-700)]">
              <Leaf size={13} className="shrink-0" /> Fresh
            </span>
            {product.farmerVerified ? (
              <>
                <span className="text-[var(--text-faint)]">•</span>
                <span>Verified Farmer</span>
              </>
            ) : null}
            <span className="text-[var(--text-faint)]">•</span>
            <span>Grade {product.grade || 'A'}</span>
          </div>
          {product.expirationDate ? (
            <span className={`product-card-expiry${expiryStatus === 'expiring_soon' ? ' is-expiring-soon' : ''}`}>
              <CalendarDays size={13} aria-hidden="true" />
              Expires {formatDate(product.expirationDate)}
            </span>
          ) : null}
        </div>

        <div className="mt-auto flex flex-col gap-3 border-t border-[var(--line)] pt-4">
          <div className="product-card-price-row flex items-end justify-between gap-3">
            <div className="product-card-price-group flex flex-wrap items-baseline gap-x-1.5">
              <span className="product-card-price text-2xl font-bold leading-none text-[var(--text)]">{formatCurrency(product.price)}</span>
              <span className="product-card-unit text-[13px] font-medium text-[var(--muted)]">/{product.unit}</span>
              {isDiscounted ? (
                <>
                  <span className="text-[13px] font-medium text-[var(--muted)] line-through">{formatCurrency(product.originalPrice)}</span>
                  <span className="rounded-full bg-[var(--green-100)] px-2 py-0.5 text-[11px] font-semibold text-[var(--green-800)]">{product.discountPercent}% OFF</span>
                </>
              ) : null}
            </div>
            <div className="product-card-stock-group flex shrink-0 flex-col items-end gap-0.5">
              <span className="product-card-stock flex items-center gap-1 text-[13px] font-semibold text-[var(--text-secondary)]">
                <Package size={13} className="shrink-0 text-[var(--muted)]" /> {formatQuantity(product.quantity)} {product.unit}
              </span>
              {isCriticallyLow ? (
                <span className="product-card-low-stock text-[13px] font-semibold text-[var(--red-700)]">Only {formatQuantity(product.quantity)} {product.unit} left</span>
              ) : null}
            </div>
          </div>

          {product.sellingType === 'wholesale' && product.moq ? (
            <p className="text-[13px] text-[var(--muted)]">Min. order (MOQ): {formatQuantity(product.moq)} {product.unit}</p>
          ) : null}

          {actions || (
            <div className="product-card-actions flex items-center gap-2">
              {canAddToCart ? (
                <button
                  type="button"
                  onClick={inCart && !justAdded ? handleRemoveFromCart : handleAddToCart}
                  disabled={isOutOfStock}
                  className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border text-[13px] font-semibold transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--green-700)] [forced-color-adjust:none] ${
                    isOutOfStock
                      ? 'cursor-not-allowed border-[var(--line)] bg-[var(--soft)] text-[var(--muted)]'
                      : justAdded
                        ? 'border-[var(--green-100)] bg-[var(--green-50)] text-[var(--green-700)]'
                        : 'border-[var(--line)] text-[var(--text-secondary)] hover:bg-[var(--soft)]'
                  }`}
                >
                  {isOutOfStock ? (
                    'Out of Stock'
                  ) : justAdded ? (
                    <><Check size={15} /> Added to Cart</>
                  ) : inCart ? (
                    <><X size={15} /> Cancel</>
                  ) : (
                    <><ShoppingCart size={15} /> Add to Cart</>
                  )}
                </button>
              ) : null}
              <Link
                to={`/products/${product.id}`}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--green-600)] text-[13px] font-semibold text-white transition-colors duration-200 hover:bg-[var(--green-700)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--green-700)] [forced-color-adjust:none]"
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
