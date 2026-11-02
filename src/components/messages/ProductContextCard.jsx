import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, UserRound, X } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import { getProductById } from '../../services/productService';

function availabilityLabel(context) {
  if (context.status !== 'active') return 'Listing unavailable';
  if (context.availableQuantity == null) return 'Availability recorded';
  if (Number(context.availableQuantity) <= 0) return 'Out of stock at inquiry';
  return `${context.availableQuantity} ${context.unit || 'units'} available at inquiry`;
}

export default function ProductContextCard({
  context, showListingLink = true, allowUnavailableListing = false, farmerReviewPopup = false,
}) {
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewProduct, setReviewProduct] = useState(null);
  const [reviewLoadState, setReviewLoadState] = useState('idle');
  const reviewDialogRef = useRef(null);

  useEffect(() => {
    const dialog = reviewDialogRef.current;
    if (!dialog) return undefined;
    if (isReviewOpen && !dialog.open) dialog.showModal();
    if (!isReviewOpen && dialog.open) dialog.close();
    return undefined;
  }, [isReviewOpen]);

  useEffect(() => {
    if (!isReviewOpen || !context?.productId) return undefined;
    let cancelled = false;
    setReviewLoadState('loading');
    getProductById(context.productId)
      .then((product) => {
        if (cancelled) return;
        if (!product || product.id !== context.productId || product.farmerId !== context.farmerId) {
          throw new Error('The live listing could not be verified as the product in this inquiry.');
        }
        setReviewProduct(product);
        setReviewLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) {
          setReviewProduct(null);
          setReviewLoadState('snapshot');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isReviewOpen, context?.productId, context?.farmerId]);

  if (!context) return null;

  const canViewListing = showListingLink && context.productId
    && (context.status === 'active' || allowUnavailableListing);
  const listingName = reviewProduct?.name || context.productName || 'Product listing';
  const listingImage = reviewProduct?.image || context.imageUrl;
  const listingCategory = reviewProduct?.category || context.category;
  const listingPrice = reviewProduct?.price ?? context.price;
  const listingUnit = reviewProduct?.unit || context.unit;
  const listingQuantity = reviewProduct?.quantity ?? context.availableQuantity;
  const listingStatus = reviewProduct?.status || context.status;
  const listingDescription = reviewProduct?.description || context.description;
  const listingLocation = reviewProduct?.location;
  const listingWholesalePrice = reviewProduct?.wholesalePrice;
  const listingWholesaleMinimum = reviewProduct?.wholesaleMinQuantity;
  return (
    <section className="messages-product-context mx-4 mt-3 rounded-xl border border-[var(--line)] bg-[var(--soft)] p-3" aria-label="Product context">
      <div className="messages-product-context-main">
        <div className="messages-product-context-product flex min-w-0 items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--panel)] text-[var(--green-700)]">
          {context.imageUrl ? <img src={context.imageUrl} alt="" className="h-full w-full object-cover" /> : <Package size={19} />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-[var(--text)]">{context.productName || 'Product listing'}</p>
            {context.category ? <p className="mt-0.5 truncate text-[13px] text-[var(--muted)]">{context.category}</p> : null}
          </div>
        </div>

        <div className="messages-product-context-details min-w-0">
          <div className="flex items-center gap-1.5 text-[13px] text-[var(--muted)]">
            <UserRound size={14} aria-hidden="true" />
            <span className="truncate">{context.farmerName || 'Farmer'}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            {context.price != null ? <span className="font-semibold text-[var(--text)]">{formatCurrency(context.price)} / {context.unit || 'unit'}</span> : null}
            {context.price != null && context.availableQuantity != null ? <span className="text-[var(--line)]" aria-hidden="true">•</span> : null}
            {context.availableQuantity != null ? <span className="text-[var(--muted)]">{availabilityLabel(context)}</span> : null}
          </div>
        </div>

        {canViewListing && farmerReviewPopup ? (
          <button
            type="button"
            onClick={() => { setReviewProduct(null); setIsReviewOpen(true); }}
            className="messages-product-context-link inline-flex min-h-9 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 text-[12px] font-medium text-[var(--green-700)] transition-colors hover:border-[var(--green-700)] hover:bg-[var(--green-50)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--green-700)]"
          >
            Review product
          </button>
        ) : canViewListing ? (
          <Link
            to={`/products/${context.productId}`}
            state={{ productContext: context }}
            className="messages-product-context-link inline-flex min-h-9 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 text-[12px] font-medium text-[var(--green-700)] transition-colors hover:border-[var(--green-700)] hover:bg-[var(--green-50)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--green-700)]"
          >
            View listing
          </Link>
        ) : null}
      </div>
      {farmerReviewPopup ? (
        <dialog
          ref={reviewDialogRef}
          className="m-auto max-h-[min(85dvh,48rem)] w-[min(42rem,calc(100%-2rem))] overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--panel)] p-0 text-[var(--text)] shadow-2xl backdrop:bg-black/60"
          aria-labelledby={`product-review-title-${context.productId}`}
          onClose={() => setIsReviewOpen(false)}
          onCancel={(event) => { event.preventDefault(); setIsReviewOpen(false); }}
          onClick={(event) => { if (event.target === event.currentTarget) setIsReviewOpen(false); }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] p-4 sm:p-5">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Review product from buyer inquiry</p>
              <h2 id={`product-review-title-${context.productId}`} className="mt-1 truncate text-lg font-medium">{listingName}</h2>
            </div>
            <button
              type="button"
              onClick={() => setIsReviewOpen(false)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--soft)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--green-700)]"
              aria-label="Close product review"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="p-4 sm:p-5">
            {reviewLoadState === 'loading' ? (
              <p className="mb-4 text-sm text-[var(--muted)]" role="status">Loading this listing…</p>
            ) : null}
            {reviewLoadState === 'snapshot' ? (
              <p className="mb-4 rounded-lg border border-[var(--line)] bg-[var(--soft)] px-3 py-2 text-sm text-[var(--text-secondary)]" role="status">
                Current listing details could not be loaded. Showing the saved details for the exact product in this inquiry.
              </p>
            ) : null}
            <div className="flex min-w-0 gap-4">
              <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--soft)] text-[var(--green-700)]">
                {listingImage ? <img src={listingImage} alt={listingName} className="h-full w-full object-cover" /> : <Package size={24} />}
              </span>
              <dl className="grid min-w-0 flex-1 grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-[var(--muted)]">Category</dt>
                  <dd className="mt-0.5 font-medium">{listingCategory || 'Not specified'}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Listing status</dt>
                  <dd className="mt-0.5 font-medium">{listingStatus || 'Unknown'}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Listing price</dt>
                  <dd className="mt-0.5 font-medium">
                    {listingPrice != null ? `${formatCurrency(listingPrice)} / ${listingUnit || 'unit'}` : 'Not recorded'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Available quantity</dt>
                  <dd className="mt-0.5 font-medium">
                    {listingQuantity != null ? `${listingQuantity} ${listingUnit || 'units'}` : 'Not recorded'}
                  </dd>
                </div>
                {listingLocation ? (
                  <div>
                    <dt className="text-[var(--muted)]">Location</dt>
                    <dd className="mt-0.5 font-medium">{listingLocation}</dd>
                  </div>
                ) : null}
                {listingWholesalePrice != null ? (
                  <div>
                    <dt className="text-[var(--muted)]">Bulk price</dt>
                    <dd className="mt-0.5 font-medium">
                      {formatCurrency(listingWholesalePrice)} / {listingUnit || 'unit'}
                      {listingWholesaleMinimum ? ` · ${listingWholesaleMinimum}+ units` : ''}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
            {listingDescription ? (
              <div className="mt-4 border-t border-[var(--line)] pt-4">
                <h3 className="text-sm font-medium">Product description</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">{listingDescription}</p>
              </div>
            ) : null}
            <p className="mt-4 text-xs text-[var(--muted)]">This is the specific product attached to the buyer’s inquiry.</p>
          </div>
        </dialog>
      ) : null}
    </section>
  );
}
