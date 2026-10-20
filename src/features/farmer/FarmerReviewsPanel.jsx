import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Star, X } from 'lucide-react';
import StarRating from '../../components/common/StarRating';
import EmptyState from '../../components/common/EmptyState';
import { getRatingsForFarmer } from '../../services/ratingService';
import { getUserById } from '../../services/authService';
import { formatDate, getInitials, shortOrderId } from '../../utils/formatters';
import './FarmerReviewsPanel.css';

const RECENT_REVIEWS_LIMIT = 3;

export default function FarmerReviewsPanel({ farmerId, orders = [] }) {
  const [ratings, setRatings] = useState([]);
  const [ratersById, setRatersById] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState('newest');
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [isRatingsOpen, setIsRatingsOpen] = useState(false);
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isRatingsOpen && !dialog.open) dialog.showModal();
    if (!isRatingsOpen && dialog.open) dialog.close();
  }, [isRatingsOpen]);

  useEffect(() => {
    let cancelled = false;
    getRatingsForFarmer(farmerId)
      .then(async (result) => {
        if (cancelled) return;
        setRatings(result);



        const uniqueRaterIds = [...new Set(result.map((rating) => rating.raterId))];
        const raters = await Promise.all(uniqueRaterIds.map((id) => getUserById(id).catch(() => null)));
        if (cancelled) return;
        setRatersById(Object.fromEntries(raters.filter(Boolean).map((rater) => [rater.id, rater])));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [farmerId]);

  const totalRatings = ratings.length;
  const averageRating = totalRatings ? ratings.reduce((sum, rating) => sum + rating.rating, 0) / totalRatings : 0;
  const starBreakdown = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: ratings.filter((rating) => rating.rating === star).length,
  }));
  const sortedRatings = useMemo(() => {
    const sortDirection = sortBy === 'oldest' || sortBy === 'lowest' ? 1 : -1;
    return [...ratings].sort((a, b) => {
      if (sortBy === 'highest' || sortBy === 'lowest') {
        return (a.rating - b.rating) * sortDirection
          || (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * sortDirection;
    });
  }, [ratings, sortBy]);
  const visibleRatings = showAllReviews ? sortedRatings : sortedRatings.slice(0, RECENT_REVIEWS_LIMIT);

  return (
    <section className="panel ratings-reviews farmer-reputation-section">
      <div className="farmer-reputation-heading">
        <div>
          <p className="eyebrow">Reputation</p>
          <h2 className="farmer-reputation-title">Ratings &amp; reviews</h2>
        </div>
      </div>

      {isLoading ? null : totalRatings === 0 ? (
        <EmptyState
          title="No reviews yet"
          message="Ratings from buyers and partner organizations will appear here once they rate a completed order or donation."
        />
      ) : (
        <div className="farmer-reputation-preview">
          <div className="farmer-reputation-preview-score">
            <span className="farmer-reputation-average">{averageRating.toFixed(1)}</span>
            <StarRating value={averageRating} size={18} />
            <span>{totalRatings} verified review{totalRatings === 1 ? '' : 's'}</span>
          </div>
          <button type="button" className="farmer-reputation-open" onClick={() => setIsRatingsOpen(true)}>
            View ratings
          </button>
          <dialog
            ref={dialogRef}
            className="farmer-reputation-dialog"
            aria-labelledby="farmer-reputation-dialog-title"
            onCancel={(event) => {
              event.preventDefault();
              setIsRatingsOpen(false);
            }}
            onClick={(event) => {
              if (event.target === event.currentTarget) setIsRatingsOpen(false);
            }}
          >
            <div className="farmer-reputation-dialog-header">
              <div>
                <p className="eyebrow">Reputation</p>
                <h2 id="farmer-reputation-dialog-title">Ratings &amp; reviews</h2>
              </div>
              <button
                type="button"
                className="farmer-reputation-close"
                aria-label="Close ratings"
                onClick={() => setIsRatingsOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="farmer-reputation-layout">
              <section className="farmer-reputation-summary" aria-label="Rating summary">
                <RatingSummary
                  averageRating={averageRating}
                  totalRatings={totalRatings}
                  starBreakdown={starBreakdown}
                />
              </section>

              <section className="farmer-reputation-reviews" aria-label="Customer reviews">
                <header className="farmer-reputation-reviews-heading">
                  <div>
                    <h3>Customer reviews</h3>
                    <span>{totalRatings} review{totalRatings === 1 ? '' : 's'}</span>
                  </div>
                  <label className="farmer-reputation-sort">
                    <span>Sort by</span>
                    <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                      <option value="newest">Newest</option>
                      <option value="oldest">Oldest</option>
                      <option value="highest">Highest rated</option>
                      <option value="lowest">Lowest rated</option>
                    </select>
                  </label>
                </header>
                <div className="farmer-reputation-review-list">
                  {visibleRatings.map((rating) => {
                    const rater = ratersById[rating.raterId];
                    const raterName = rater?.organizationName || rater?.name
                      || (rating.raterRole === 'stakeholder' ? 'Partner organization' : 'Buyer');
                    const order = orders.find((entry) => entry.id === rating.orderId);
                    const verificationLabel = rating.raterRole === 'stakeholder' ? 'Verified Partner' : 'Verified Buyer';
                    return (
                      <article key={rating.id} className="farmer-reputation-review">
                        <header className="farmer-reputation-review-header">
                          <span className="farmer-reputation-avatar" aria-hidden="true">{getInitials(raterName)}</span>
                          <div className="farmer-reputation-review-identity">
                            <strong>{raterName}</strong>
                            <span className="farmer-reputation-verified"><BadgeCheck size={13} /> {verificationLabel}</span>
                          </div>
                          <time className="farmer-reputation-date" dateTime={rating.createdAt}>
                            {formatDate(rating.createdAt)}
                          </time>
                        </header>
                        <div className="farmer-reputation-review-rating" aria-label={`${rating.rating} out of 5 stars`}>
                          <StarRating value={rating.rating} size={16} />
                        </div>
                        {order?.productName ? (
                          <p className="farmer-reputation-product"><span>Product:</span> {order.productName}</p>
                        ) : null}
                        <p className={`farmer-reputation-comment${rating.comment ? '' : ' is-empty'}`}>
                          {rating.comment ? `“${rating.comment}”` : 'No written review'}
                        </p>
                        {rating.orderId ? (
                          <footer className="farmer-reputation-review-footer">
                            <span>Order #{shortOrderId(rating.orderId)}</span>
                            <Link
                              to={`/orders/${rating.orderId}`}
                              onClick={() => setIsRatingsOpen(false)}
                            >
                              View order <span aria-hidden="true">→</span>
                            </Link>
                          </footer>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
                {totalRatings > RECENT_REVIEWS_LIMIT ? (
                  <button
                    type="button"
                    className="farmer-reputation-view-all"
                    onClick={() => setShowAllReviews((current) => !current)}
                    aria-expanded={showAllReviews}
                  >
                    {showAllReviews ? 'Show recent reviews' : 'View all reviews'}
                  </button>
                ) : null}
              </section>
            </div>
          </dialog>
        </div>
      )}
    </section>
  );
}

function RatingSummary({ averageRating, totalRatings, starBreakdown }) {
  return (
    <>
      <div className="farmer-reputation-score">
        <span className="farmer-reputation-average">{averageRating.toFixed(1)}</span>
        <StarRating value={averageRating} size={18} />
        <p>{totalRatings} verified review{totalRatings === 1 ? '' : 's'}</p>
      </div>
      <div className="farmer-reputation-breakdown" aria-label="Rating distribution">
        {starBreakdown.map(({ star, count }) => (
          <div key={star} className="farmer-reputation-bar-row">
            <span className="farmer-reputation-bar-label">{star} <Star size={13} /></span>
            <div
              className="farmer-reputation-bar-track"
              role="meter"
              aria-label={`${star} star reviews`}
              aria-valuemin={0}
              aria-valuemax={totalRatings}
              aria-valuenow={count}
            >
              <div
                className="farmer-reputation-bar-fill"
                style={{ width: `${totalRatings ? (count / totalRatings) * 100 : 0}%` }}
              />
            </div>
            <span className="farmer-reputation-bar-count">{count}</span>
          </div>
        ))}
      </div>
    </>
  );
}
