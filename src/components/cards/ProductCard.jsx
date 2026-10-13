import { hasWholesalePricing } from '../../../backend/shared/pricing.js';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  ArrowRight, CalendarDays, Check, Eye, Leaf, MapPin, Package, ShoppingCart, Sprout, Star, User, X,
} from 'lucide-react';
import StatusBadge from '../common/StatusBadge';
import { formatCurrency, formatDate, formatQuantity, titleCase } from '../../utils/formatters';
import { getExpiryStatus, ORDERING_ROLES } from '../../utils/constants';
import Modal from '../admin/Modal';
import { useAuth } from '../../features/auth/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { useToast } from '../../contexts/ToastContext';
import AdminReferenceNotice from '../market/AdminReferenceNotice';






const CRITICAL_STOCK_THRESHOLD = 5;



const ADDED_FEEDBACK_MS = 1500;







export default function ProductCard({ product, actions, showStatus = false, className = '', marketReference }) {
  const { currentUser } = useAuth();
  const { addItem, removeItem, isInCart } = useCart();
  const { showToast } = useToast();
  const isDiscounted = Boolean(product.discountPercent);
  const expiryStatus = getExpiryStatus(product.expirationDate);
  const isCriticallyLow = product.quantity > 0 && product.quantity <= CRITICAL_STOCK_THRESHOLD;
  const isOutOfStock = !(product.quantity > 0);
  const isPendingReview = product.priceReview?.status === 'pending';
  const canAddToCart = ORDERING_ROLES.includes(currentUser?.role);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false);



  const inCart = isInCart(product.id);

  const handleAddToCart = () => {
    const minimum = product.sellingType === 'wholesale' && product.moq ? Number(product.moq) : 1;
    addItem(product.id, product.quantity, minimum);
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
      {

                                                                                        }
      <button
        type="button"
        onClick={() => setIsQuickViewOpen(true)}
        aria-label={`Review ${titleCase(product.name)} details`}
        title={`View ${titleCase(product.name)} details`}
        className="product-card-media-trigger group/media relative block h-[200px] w-full shrink-0 cursor-pointer overflow-hidden border-0 bg-[var(--green-50)] p-0 text-left sm:h-[220px] lg:h-[240px]"
      >
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
        <span className="product-card-media-hint">
          <Eye size={14} aria-hidden="true" />
          View details
        </span>
      </button>

      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex flex-col gap-3">
          <div>
            <p className="product-card-category text-[13px] font-medium text-[var(--muted)]">{titleCase(product.category)}</p>
            <button
              type="button"
              onClick={() => setIsQuickViewOpen(true)}
              className="product-card-title-trigger block w-full border-0 bg-transparent p-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--green-700)]"
            >
              <h3
                title={titleCase(product.name)}
                className="product-card-name mt-0.5 line-clamp-2 text-[19px] font-semibold leading-snug text-[var(--text)] transition-colors duration-150 hover:text-[var(--green-800)]"
              >
                {titleCase(product.name)}
              </h3>
              {product.description?.trim() ? (
                <p className="product-card-description mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-[var(--muted)]">
                  {product.description.trim()}
                </p>
              ) : null}
            </button>
            {isPendingReview ? (
              <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900" role="status">
                Price review pending — ordering unavailable until approved.
              </p>
            ) : null}
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

          {
                                                                                              }
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

          {marketReference ? <AdminReferenceNotice reference={marketReference} /> : null}
          {hasWholesalePricing(product) ? (
            <p className="product-card-wholesale-price">
              Wholesale available: {formatCurrency(product.wholesalePrice)}/{product.unit} for {formatQuantity(product.wholesaleMinQuantity)}+ {product.unit}
            </p>
          ) : null}

          {product.sellingType === 'wholesale' && product.moq ? (
            <p className="text-[13px] text-[var(--muted)]">Min. order (MOQ): {formatQuantity(product.moq)} {product.unit}</p>
          ) : null}

          {actions || (
            <div className="product-card-actions flex items-center gap-2">
              {canAddToCart ? (
                <button
                  type="button"
                  onClick={inCart && !justAdded ? handleRemoveFromCart : handleAddToCart}
                  disabled={isOutOfStock || (isPendingReview && !inCart)}
                  className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border text-[13px] font-semibold transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--green-700)] [forced-color-adjust:none] ${
                    isOutOfStock || (isPendingReview && !inCart)
                      ? 'cursor-not-allowed border-[var(--line)] bg-[var(--soft)] text-[var(--muted)]'
                      : justAdded
                        ? 'border-[var(--green-100)] bg-[var(--green-50)] text-[var(--green-700)]'
                        : 'border-[var(--line)] text-[var(--text-secondary)] hover:bg-[var(--soft)]'
                  }`}
                >
                  {isPendingReview && !inCart ? (
                    'Price Under Review'
                  ) : isOutOfStock ? (
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
      {isQuickViewOpen ? createPortal(
        <Modal
          open={isQuickViewOpen}
          onClose={() => setIsQuickViewOpen(false)}
          eyebrow={titleCase(product.category)}
          title="Product details"
          dialogLabel={`${titleCase(product.name)} product details`}
          className="product-quick-view-overlay"
        >
          <div className="product-quick-view">
            <div className="product-quick-view-image">
              {product.image && !imageFailed
                ? <img src={product.image} alt={titleCase(product.name)} onError={() => setImageFailed(true)} />
                : <Sprout size={34} strokeWidth={1.5} aria-hidden="true" />}
            </div>
            <div className="product-quick-view-heading">
              <div>
                <h3>{titleCase(product.name)}</h3>
                <p>{product.farmerName || 'Local farmer'}{product.location ? ` · ${product.location}` : ''}</p>
              </div>
              <span className={`badge badge-grade-${(product.grade || 'A').toLowerCase()}`}>Grade {product.grade || 'A'}</span>
            </div>
            <p className="product-quick-view-price">
              {formatCurrency(product.price)}<span>/{product.unit}</span>
            </p>
            <p className="product-quick-view-stock">
              {formatQuantity(product.quantity)} {product.unit} available
              {isCriticallyLow ? <span> · Low stock</span> : null}
            </p>
            {product.description?.trim() ? (
              <section className="product-quick-view-description" aria-labelledby={`product-description-${product.id}`}>
                <h4 id={`product-description-${product.id}`}>Description</h4>
                <p>{product.description.trim()}</p>
              </section>
            ) : null}
            <dl className="product-quick-view-meta">
              {product.farmerVerified ? <div><dt>Seller</dt><dd>Verified farmer</dd></div> : null}
              {product.expirationDate ? <div><dt>Expires</dt><dd>{formatDate(product.expirationDate)}</dd></div> : null}
              {product.sellingType === 'wholesale' && product.moq ? (
                <div><dt>Minimum order</dt><dd>{formatQuantity(product.moq)} {product.unit}</dd></div>
              ) : null}
            </dl>
            <Link
              to={`/products/${product.id}`}
              className="btn btn-primary btn-md product-quick-view-action"
              onClick={() => setIsQuickViewOpen(false)}
            >
              {isPendingReview ? 'View listing details' : 'View product & order'} <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </Modal>,
        document.body,
      ) : null}
    </article>
  );
}
