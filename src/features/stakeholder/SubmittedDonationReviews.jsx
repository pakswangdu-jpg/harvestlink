import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, MessageSquare, X } from 'lucide-react';
import Button from '../../components/common/Button';
import StarRating from '../../components/common/StarRating';
import { getMyDonationRatings } from '../../services/ratingService';
import { formatDate } from '../../utils/formatters';

export default function SubmittedDonationReviews({ donations, revision }) {
  const [reviews, setReviews] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const dialogRef = useRef(null);
  const dialogTitleId = useId();

  useEffect(() => {
    let cancelled = false;
    getMyDonationRatings().then((result) => {
      if (cancelled) return;
      setReviews(result);
      setError('');
    }).catch(() => {
      if (!cancelled) setError('Unable to load your donation feedback.');
    });
    return () => { cancelled = true; };
  }, [revision, attempt]);

  const farmers = new Map(donations.map(({ farmerId, farmerName }) => [farmerId, farmerName]));
  const products = new Map(donations.map(({ farmerId, productId, productName }) => (
    [JSON.stringify([farmerId, productId]), productName]
  )));
  const reviewsByFarmer = new Map();
  for (const review of reviews || []) {
    if (!reviewsByFarmer.has(review.farmerId)) reviewsByFarmer.set(review.farmerId, []);
    reviewsByFarmer.get(review.farmerId).push(review);
  }

  return (
    <section id="my-donation-reviews" className="panel scroll-mt-4" aria-labelledby="my-donation-reviews-heading" tabIndex={-1}>
      <div className="section-heading flex-wrap gap-3">
        <h2 id="my-donation-reviews-heading">My Donation Reviews</h2>
        <Button aria-haspopup="dialog" onClick={() => dialogRef.current?.showModal()}>
          <MessageSquare size={16} aria-hidden="true" /> View my reviews
        </Button>
      </div>
      <dialog
        ref={dialogRef}
        aria-labelledby={dialogTitleId}
        className="m-auto w-[calc(100%-1.5rem)] max-w-[640px] max-h-[calc(100dvh-1.5rem)] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] p-0 text-[var(--text)] backdrop:bg-black/60 open:flex open:flex-col"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 sm:px-5">
          <h2 id={dialogTitleId} className="text-lg font-semibold">My Donation Reviews</h2>
          <Button variant="secondary" size="sm" aria-label="Close donation reviews" onClick={() => dialogRef.current?.close()}>
            <X size={16} aria-hidden="true" />
          </Button>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">
          {error ? (
            <div className="form-stack">
              <p role="alert">{error}</p>
              <div><Button variant="secondary" size="sm" onClick={() => {
                setError('');
                setAttempt((value) => value + 1);
              }}>Retry</Button></div>
            </div>
          ) : null}
          {!error && reviews === null ? <p role="status">Loading your feedback…</p> : null}
          {!error && reviews?.length === 0 ? <p>You haven’t submitted donation feedback yet.</p> : null}
          <div className="grid gap-2">
            {[...reviewsByFarmer].map(([farmerId, farmerReviews]) => (
              <details key={farmerId} className="rounded-lg border border-[var(--line)]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--green-700)] [&::-webkit-details-marker]:hidden">
                  <strong className="min-w-0 break-words">{farmers.get(farmerId) || 'Farmer name unavailable'}</strong>
                  <span className="flex shrink-0 items-center gap-2 text-sm text-[var(--muted)]">
                    {farmerReviews.length} {farmerReviews.length === 1 ? 'review' : 'reviews'}
                    <ChevronDown size={16} aria-hidden="true" />
                  </span>
                </summary>
                <ul className="m-0 list-none px-4">
                  {farmerReviews.map((review) => (
                    <li key={review.id} className="border-t border-[var(--line)] py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <strong className="min-w-0 break-words">{products.get(JSON.stringify([farmerId, review.productId])) || 'Donation review'}</strong>
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
              </details>
            ))}
          </div>
        </div>
      </dialog>
    </section>
  );
}
