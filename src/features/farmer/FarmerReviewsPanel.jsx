import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BadgeCheck, Star } from 'lucide-react';
import StarRating from '../../components/common/StarRating';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import { getRatingsForFarmer } from '../../services/ratingService';
import { getUserById } from '../../services/authService';
import { formatDate, getInitials, shortOrderId } from '../../utils/formatters';

const RECENT_REVIEWS_LIMIT = 3;

// A "Ratings & reviews" panel embedded directly on FarmerDashboard.jsx — this is the only
// place a farmer's rating history is shown (deliberately not its own page/nav item). Shows
// a score+breakdown summary plus the most recent reviews, the same "recent N, not the full
// list" treatment the dashboard's Products/Orders panels already use. "Add a product"/"View
// marketplace" live in this panel's own footer rather than floating below it on the dashboard.
export default function FarmerReviewsPanel({ farmerId }) {
  const navigate = useNavigate();
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
    <section className="panel ratings-reviews">
      <div className="rr-heading">
        <p className="eyebrow">Reputation</p>
        <h2 className="rr-title">Ratings &amp; reviews</h2>
      </div>

      {isLoading ? null : totalRatings === 0 ? (
        <EmptyState
          title="No reviews yet"
          message="Ratings from buyers and partner organizations will appear here once they rate a completed order or donation."
        />
      ) : (
        <div className="rr-layout">
          <div className="rr-summary">
            <div className="rr-summary-top">
              <span className="rr-score">{averageRating.toFixed(1)}</span>
              <StarRating value={averageRating} size={18} />
              <p className="rr-count">Based on {totalRatings} verified review{totalRatings === 1 ? '' : 's'}</p>
            </div>
            <div className="rr-breakdown">
              {starBreakdown.map(({ star, count }) => (
                <div key={star} className="rr-bar-row">
                  <span className="rr-bar-label">{star} <Star size={11} /></span>
                  <div className="rr-bar-track">
                    <div
                      className="rr-bar-fill"
                      style={{ width: `${totalRatings ? (count / totalRatings) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="rr-bar-count">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rr-list">
            {ratings.slice(0, RECENT_REVIEWS_LIMIT).map((rating) => {
              const rater = ratersById[rating.raterId];
              const raterName = rater?.organizationName || rater?.name
                || (rating.raterRole === 'stakeholder' ? 'Partner organization' : 'Buyer');
              return (
                <article key={rating.id} className="rr-card">
                  <header className="rr-card-header">
                    <span className="rr-avatar">{getInitials(raterName)}</span>
                    <div className="rr-card-identity">
                      <strong>{raterName}</strong>
                      <span className="rr-verified"><BadgeCheck size={13} /> Verified Buyer</span>
                    </div>
                    <span className="rr-card-date">{formatDate(rating.createdAt)}</span>
                  </header>
                  <StarRating value={rating.rating} size={14} />
                  {rating.comment ? <p className="rr-card-comment">&quot;{rating.comment}&quot;</p> : null}
                  {rating.orderId ? (
                    <footer className="rr-card-footer">
                      <span className="rr-order-ref">Order #{shortOrderId(rating.orderId)}</span>
                      <Link className="rr-view-order" to={`/orders/${rating.orderId}`}>View Order</Link>
                    </footer>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      )}

      <div className="rr-footer">
        <Button className="rr-footer-btn" onClick={() => navigate('/farmer-products')}>Add Product</Button>
        <Link className="btn btn-secondary rr-footer-btn" to="/marketplace">View Marketplace</Link>
      </div>
    </section>
  );
}
