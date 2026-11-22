import { useEffect, useState } from 'react';
import { Card, CardHeader } from '../../components/admin/Card';
import Pagination from '../../components/admin/Pagination';
import { usePagination } from '../../components/admin/usePagination';
import Button from '../../components/common/Button';
import StarRating from '../../components/common/StarRating';
import { getRatingsForFarmer } from '../../services/ratingService';
import { formatDate } from '../../utils/formatters';

export default function DonationReviewsReceived({ farmerId, donations }) {
  const [reviews, setReviews] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const { page, pageRows, pageSize, total, setPage } = usePagination(reviews || [], 5);

  useEffect(() => {
    let cancelled = false;
    getRatingsForFarmer(farmerId)
      .then((ratings) => {
        if (!cancelled) setReviews(ratings.filter((rating) => rating.raterRole === 'stakeholder' && !rating.orderId));
      })
      .catch(() => {
        if (!cancelled) setError('Unable to load donation reviews.');
      });
    return () => { cancelled = true; };
  }, [farmerId, attempt]);

  const productNames = new Map(donations.filter((donation) => donation.productId)
    .map((donation) => [donation.productId, donation.productName]));

  return (
    <Card className="mt-4">
      <CardHeader title="Donation reviews" />
      {error ? (
        <div className="form-stack">
          <p role="alert">{error}</p>
          <div><Button variant="secondary" size="sm" onClick={() => {
            setError('');
            setAttempt((value) => value + 1);
          }}>Retry</Button></div>
        </div>
      ) : reviews === null ? <p role="status">Loading donation reviews…</p>
        : total === 0 ? <p>You haven’t received donation reviews yet.</p>
          : (
            <>
              <ul className="m-0 list-none p-0">
                {pageRows.map((review) => (
                  <li key={review.id} className="border-t border-[var(--line)] py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <strong className="min-w-0 break-words">{productNames.get(review.productId) || 'Donation review'}</strong>
                      <time className="text-sm text-[var(--muted)]" dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-sm">
                      <span aria-hidden="true"><StarRating value={review.rating} size={14} /></span>
                      <span>{review.rating}/5</span>
                    </div>
                    {review.comment?.trim() ? (
                      <blockquote className="mt-2 whitespace-pre-wrap break-words border-l-2 border-[var(--line)] pl-3 text-sm text-[var(--text)]">
                        {review.comment}
                      </blockquote>
                    ) : <p className="mt-2 text-sm text-[var(--muted)]">No written feedback was submitted.</p>}
                  </li>
                ))}
              </ul>
              {total > pageSize ? <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} /> : null}
            </>
          )}
    </Card>
  );
}
