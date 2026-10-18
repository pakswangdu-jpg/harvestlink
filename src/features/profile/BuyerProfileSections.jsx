import { useEffect, useState } from 'react';
import { ArrowRight, Edit3, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from '../../components/common/Button';
import { getOrdersByBuyer } from '../../services/orderService';
import { getRatingsForFarmer } from '../../services/ratingService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { summarizeBuyerActivity } from './buyerProfileActivity';

export default function BuyerProfileSections({ user, onEditDelivery }) {
  const [state, setState] = useState({ userId: null, activity: null, error: '', reviewsUnavailable: false });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const orders = await getOrdersByBuyer(user.id);
        const farmerIds = [...new Set(orders.map((order) => order.farmerId).filter(Boolean))];
        const results = await Promise.allSettled(farmerIds.map(getRatingsForFarmer));
        if (cancelled) return;
        setState({
          userId: user.id,
          activity: summarizeBuyerActivity(orders, results.flatMap((result) => result.status === 'fulfilled' ? result.value : []), user.id),
          reviewsUnavailable: results.some((result) => result.status === 'rejected'),
          error: '',
        });
      } catch {
        if (!cancelled) setState({ userId: user.id, activity: null, error: 'Purchase activity could not be loaded. Your profile details are still available.', reviewsUnavailable: false });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [user.id]);

  const loading = state.userId !== user.id;
  const activity = loading ? null : state.activity;
  const reviewsUnavailable = loading || state.reviewsUnavailable;
  const latestReview = reviewsUnavailable ? null : activity?.latestReview;

  return (
    <>
      <section className="buyer-account-section" aria-labelledby="buyer-activity-title" aria-busy={loading}>
        <div className="section-heading">
          <div><p className="eyebrow">Buyer activity</p><h2 id="buyer-activity-title">Purchase activity</h2></div>
          <Link className="buyer-account-link" to="/buyer-orders">View orders <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
        {loading ? <p className="muted" role="status">Loading purchase activity...</p> : state.error ? <p className="muted" role="status">{state.error}</p> : (
          <dl className="buyer-profile-activity">
            <div><dt>Total orders</dt><dd>{activity.totalOrders}</dd></div>
            <div><dt>Completed orders</dt><dd>{activity.completedOrders}</dd></div>
            <div><dt>Total spent</dt><dd>{formatCurrency(activity.totalSpent)}</dd></div>
            <div><dt>Reviews given</dt><dd>{reviewsUnavailable ? 'Unavailable' : activity.reviewsGiven}</dd></div>
          </dl>
        )}
      </section>

      <div className="buyer-profile-details-grid">
        <section className="buyer-account-section" aria-labelledby="buyer-delivery-title">
          <div className="section-heading"><h2 id="buyer-delivery-title">Delivery details</h2></div>
          <dl className="buyer-profile-information">
            <div><dt>Default delivery address</dt><dd>{user.address || 'Not provided'}</dd></div>
            <div><dt>City / location</dt><dd>{user.municipality || 'Not provided'}</dd></div>
            <div><dt>ZIP code</dt><dd>{user.zipCode || 'Not provided'}</dd></div>
          </dl>
          <Button variant="secondary" onClick={onEditDelivery}><Edit3 size={15} aria-hidden="true" /> Edit delivery details</Button>
        </section>

        {activity && !reviewsUnavailable ? (
          <section className="buyer-account-section" aria-labelledby="buyer-reviews-title">
            <div className="section-heading"><h2 id="buyer-reviews-title">Reviews &amp; ratings</h2></div>
            <p className="muted">{activity.reviewsGiven} {activity.reviewsGiven === 1 ? 'review' : 'reviews'} given</p>
            {latestReview ? (
              <div className="buyer-profile-latest-review">
                <h3>Latest review</h3>
                <p>{latestReview.order.productName} &middot; {latestReview.order.farmerName}</p>
                <span className="buyer-profile-review-stars" aria-label={`${latestReview.rating} out of 5 stars`}>
                  {Array.from({ length: 5 }, (_, index) => <Star key={index} size={14} fill={index < latestReview.rating ? 'currentColor' : 'none'} aria-hidden="true" />)}
                </span>
                {latestReview.comment ? <p>{latestReview.comment}</p> : null}
                <p className="muted">{formatDate(latestReview.createdAt)}</p>
                <Link className="buyer-account-link" to={`/orders/${latestReview.orderId}`}>View order <ArrowRight size={14} aria-hidden="true" /></Link>
              </div>
            ) : <p className="muted">Your reviews will appear here after you rate a completed order.</p>}
          </section>
        ) : null}
      </div>
    </>
  );
}
