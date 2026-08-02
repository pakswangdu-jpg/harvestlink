import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import StarRating from '../../components/common/StarRating';
import EmptyState from '../../components/common/EmptyState';
import { getRatingsForFarmer } from '../../services/ratingService';
import { getUserById } from '../../services/authService';
import { formatDate, getInitials, shortOrderId } from '../../utils/formatters';

const RECENT_REVIEWS_LIMIT = 3;

// A "Ratings & reviews" panel embedded directly on FarmerDashboard.jsx — this is the only
// place a farmer's rating history is shown (deliberately not its own page/nav item). Shows
// a score+breakdown summary plus the most recent reviews, the same "recent N, not the full
// list" treatment the dashboard's Products/Orders panels already use.
export default function FarmerReviewsPanel({ farmerId }) {
  const [ratings, setRatings] = useState([]);
  const [ratersById, setRatersById] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getRatingsForFarmer(farmerId)
      .then(async (result) => {
        if (cancelled) return;
        setRatings(result);
        // Ratings only carry raterId/raterRole, not a snapshotted name (see
        // backend/src/lib/serialize.js's serializeRating) — resolved once per unique rater
        // rather than once per rating.
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

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Reputation</p>
          <h2>Ratings &amp; reviews</h2>
        </div>
      </div>

      {isLoading ? null : totalRatings === 0 ? (
        <EmptyState
          title="No reviews yet"
          message="Ratings from buyers and partner organizations will appear here once they rate a completed order or donation."
        />
      ) : (
        <>
          <div className="review-summary">
            <div className="review-summary-score">
              <strong>{averageRating.toFixed(1)}</strong>
              <StarRating value={averageRating} size={20} />
              <span>{totalRatings} rating{totalRatings === 1 ? '' : 's'}</span>
            </div>
            <div className="review-summary-breakdown">
              {starBreakdown.map(({ star, count }) => (
                <div key={star} className="review-summary-bar-row">
                  <span className="review-summary-bar-label">{star} <Star size={12} /></span>
                  <div className="review-summary-bar-track">
                    <div
                      className="review-summary-bar-fill"
                      style={{ width: `${totalRatings ? (count / totalRatings) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="review-summary-bar-count">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="review-list review-list-recent">
            {ratings.slice(0, RECENT_REVIEWS_LIMIT).map((rating) => {
              const rater = ratersById[rating.raterId];
              const raterName = rater?.organizationName || rater?.name
                || (rating.raterRole === 'stakeholder' ? 'Partner organization' : 'Buyer');
              return (
                <div key={rating.id} className="ot-review-card">
                  <div className="ot-review-header">
                    <div className="review-rater">
                      <span className="farmer-list-avatar buyer">{getInitials(raterName)}</span>
                      <div>
                        <strong>{raterName}</strong>
                        <span className="ot-review-date">{formatDate(rating.createdAt)}</span>
                      </div>
                    </div>
                    <StarRating value={rating.rating} size={16} />
                  </div>
                  {rating.comment ? <p className="ot-review-comment">&quot;{rating.comment}&quot;</p> : null}
                  {rating.orderId ? (
                    <Link className="btn btn-secondary btn-sm review-order-link" to={`/orders/${rating.orderId}`}>
                      View order #{shortOrderId(rating.orderId)}
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
