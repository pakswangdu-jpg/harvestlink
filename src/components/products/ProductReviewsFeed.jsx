import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import StarRating from '../common/StarRating';
import { getUserById } from '../../services/authService';
import { getRatingsForProduct } from '../../services/ratingService';
import { formatDate, getInitials } from '../../utils/formatters';
import './ProductReviewsFeed.css';

export default function ProductReviewsFeed({ productId, productName, className = '' }) {
  const [feed, setFeed] = useState({ productId: null, ratings: [], ratersById: {}, state: 'loading' });

  useEffect(() => {
    if (!productId) return undefined;

    let cancelled = false;
    getRatingsForProduct(productId)
      .then(async (result) => {
        if (cancelled) return;
        const nextRatings = Array.isArray(result) ? result : [];
        const uniqueRaterIds = [...new Set(nextRatings.map((rating) => rating.raterId).filter(Boolean))];
        const raters = await Promise.all(uniqueRaterIds.map((id) => getUserById(id).catch(() => null)));
        if (cancelled) return;
        setFeed({
          productId,
          ratings: nextRatings,
          ratersById: Object.fromEntries(raters.filter(Boolean).map((rater) => [rater.id, rater])),
          state: nextRatings.length ? 'ready' : 'empty',
        });
      })
      .catch(() => {
        if (!cancelled) setFeed({ productId, ratings: [], ratersById: {}, state: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [productId]);

  const currentFeed = feed.productId === productId
    ? feed
    : { ratings: [], ratersById: {}, state: 'loading' };
  const { ratings, ratersById, state } = currentFeed;
  const averageRating = useMemo(() => (
    ratings.length ? ratings.reduce((total, rating) => total + Number(rating.rating || 0), 0) / ratings.length : 0
  ), [ratings]);

  if (!productId) return null;

  return (
    <section className={`product-reviews-feed ${className}`.trim()} aria-labelledby={`product-reviews-title-${productId}`}>
      <header className="product-reviews-feed-heading">
        <div>
          <p className="product-reviews-feed-eyebrow">
            {productName ? `Reviews for ${productName}` : 'Reviews for this product'}
          </p>
          <h3 id={`product-reviews-title-${productId}`}>Ratings &amp; reviews</h3>
        </div>
        {state === 'ready' ? (
          <div className="product-reviews-feed-summary" aria-label={`${averageRating.toFixed(1)} out of 5 from ${ratings.length} reviews`}>
            <StarRating value={averageRating} size={15} />
            <strong>{averageRating.toFixed(1)}</strong>
            <span>({ratings.length})</span>
          </div>
        ) : null}
      </header>

      {state === 'loading' ? <p className="product-reviews-feed-state">Loading reviews...</p> : null}
      {state === 'error' ? <p className="product-reviews-feed-state">Reviews are temporarily unavailable.</p> : null}
      {state === 'empty' ? <p className="product-reviews-feed-state">No reviews for this product yet.</p> : null}
      {state === 'ready' ? (
        <div className="product-reviews-feed-list">
          {ratings.map((rating) => {
            const rater = ratersById[rating.raterId];
            const raterName = rater?.organizationName || rater?.name
              || (rating.raterRole === 'stakeholder' ? 'Partner organization' : 'Buyer');
            const verificationLabel = rating.raterRole === 'stakeholder' ? 'Verified Partner' : 'Verified Buyer';
            return (
              <article key={rating.id} className="product-review-item">
                <header className="product-review-item-header">
                  <span className="product-review-avatar" aria-hidden="true">{getInitials(raterName)}</span>
                  <div className="product-review-identity">
                    <strong>{raterName}</strong>
                    <span><BadgeCheck size={12} aria-hidden="true" /> {verificationLabel}</span>
                  </div>
                  <time dateTime={rating.createdAt}>{formatDate(rating.createdAt)}</time>
                </header>
                <StarRating value={rating.rating} size={15} />
                <p className={`product-review-comment${rating.comment ? '' : ' is-empty'}`}>
                  {rating.comment || 'No written review'}
                </p>
                {(rating.reviewImageUrls?.length ? rating.reviewImageUrls : rating.reviewImageUrl ? [rating.reviewImageUrl] : []).map((imageUrl, index) => (
                  <img key={`${imageUrl}-${index}`} className="product-review-image" src={imageUrl} alt={`Photo ${index + 1} shared with this review`} loading="lazy" />
                ))}
                {rating.reviewVideoUrl ? (
                  <video className="product-review-video" src={rating.reviewVideoUrl} controls preload="metadata">
                    Your browser does not support video playback.
                  </video>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
