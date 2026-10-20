import { formatCurrency, formatDate } from '../../utils/formatters';

export default function ProductPriceReviewNotice({ product, showSubmitted = false }) {
  const review = product?.priceReview;
  if (!review || !['pending', 'needs_adjustment', 'approved'].includes(review.status)) return null;
  if (review.status === 'pending') return showSubmitted ? <div className="product-price-review-note"><span>Your price: {formatCurrency(product.price)}/{product.unit}</span><span>Pending price review</span></div> : null;
  const adjustment = review.status === 'needs_adjustment';
  const amount = adjustment ? review.maxAllowedPrice : review.approvedPrice ?? review.farmerPrice;
  return <div className="product-price-review-note">
    {showSubmitted || adjustment ? <span>Your submitted price: {formatCurrency(product.price)}/{product.unit}</span> : null}
    {adjustment ? <span>Needs price adjustment · Admin recommended maximum: {amount == null ? 'Data unavailable' : `${formatCurrency(amount)}/${review.reviewUnit || product.unit}`}</span>
      : <span>Price approved{amount != null ? `: ${formatCurrency(amount)}/${review.reviewUnit || product.unit}` : ''}</span>}
    {adjustment && review.declineReason ? <span>Admin note: {review.declineReason}</span> : null}
    {!adjustment && review.decidedAt ? <span>{review.decidedBy ? 'Approved by Admin · ' : ''}{formatDate(review.decidedAt)}</span> : null}
  </div>;
}
