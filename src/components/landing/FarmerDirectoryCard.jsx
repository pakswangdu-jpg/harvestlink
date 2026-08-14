import { memo } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  MapPin, PackageCheck, Star,
} from 'lucide-react';
import verifiedIcon from '../../assets/icons/verified-farmer.png';
import StarRating from '../common/StarRating';
import { getInitials } from '../../utils/formatters';

const STAR_LEVELS = [5, 4, 3, 2, 1];

// Currently only consumed by TopRatedFarmersCarousel. Memoized so the carousel's continuous
// autoplay (a fresh scroll/select cycle every ~4s) never re-renders cards that aren't the ones
// mounting/unmounting at the loop boundary.
export const FarmerDirectoryCard = memo(function FarmerDirectoryCard({ farmer }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.article
      whileHover={shouldReduceMotion ? undefined : { y: -8 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      // relative + hover:z-10: lifting a card makes its shadow extend past its own box into
      // the neighboring card's space — without this, the next card (painted later in DOM
      // order) rendered on top and clipped the hovered card's shadow/edge instead of the
      // hovered card rising above it, which is what showed up as a stray gray sliver peeking
      // out from behind the hovered card.
      className="group relative z-0 flex h-full flex-col rounded-[24px] border border-gray-100 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.08)] transition-shadow duration-300 hover:z-10 hover:shadow-[0_20px_40px_rgba(16,24,40,0.14)]"
    >
      <div className="flex items-center gap-3">
        <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-green-100 text-base font-bold text-green-800">
          {farmer.avatarUrl ? (
            <img
              src={farmer.avatarUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            getInitials(farmer.name)
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            {/* line-clamp-2, not truncate — a one-line ellipsis was cutting real (often
                multi-word Filipino) names down to "John Domi…", which read as broken rather
                than just compact. Two lines fits virtually every name in full. */}
            <h3 title={farmer.name} className="line-clamp-2 text-[15px] font-bold leading-snug text-gray-900">
              {farmer.name}
            </h3>
            <img
              src={verifiedIcon}
              alt="Verified farmer"
              width={15}
              height={15}
              className="mt-0.5 h-[15px] w-[15px] shrink-0 object-contain transition-transform duration-300 group-hover:scale-110"
            />
          </div>
          {farmer.farmName ? <p className="truncate text-[13px] font-medium text-green-700">{farmer.farmName}</p> : null}
        </div>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-[13px] text-gray-500">
        <MapPin size={14} className="shrink-0 text-gray-400" /> {farmer.municipality}
      </p>

      <div className="relative mt-4 flex items-center gap-2 overflow-hidden">
        <StarRating value={farmer.avgRating} size={15} />
        <span className="text-[13px] font-semibold text-gray-700">{farmer.avgRating.toFixed(1)}</span>
        <span className="text-[12px] text-gray-400">({farmer.ratingCount} review{farmer.ratingCount === 1 ? '' : 's'})</span>
        {shouldReduceMotion ? null : (
          <motion.span
            aria-hidden="true"
            initial={{ x: '-120%' }}
            whileInView={{ x: '220%' }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.9, ease: 'easeOut', delay: 0.2 }}
            className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/70 to-transparent"
          />
        )}
      </div>

      {/* 5/4/3/2/1 broken out into their own rows (rather than just the one averaged score
          above) so a visitor can see, e.g., a 4.6 that's mostly 5s vs. mostly 4s-with-a-few-1s. */}
      {farmer.ratingCount > 0 ? (
        <div className="mt-3 space-y-1" aria-label="Rating breakdown">
          {STAR_LEVELS.map((star) => {
            const count = farmer.ratingBreakdown?.[star] || 0;
            const percent = farmer.ratingCount ? (count / farmer.ratingCount) * 100 : 0;
            return (
              <div key={star} className="flex items-center gap-1.5">
                <span className="flex w-6 shrink-0 items-center justify-end gap-0.5 text-[10px] font-semibold text-gray-500">
                  {star} <Star size={9} className="text-amber-400" fill="currentColor" />
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                  {shouldReduceMotion ? (
                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${percent}%` }} />
                  ) : (
                    <motion.div
                      className="h-full rounded-full bg-amber-400"
                      initial={{ width: 0 }}
                      whileInView={{ width: `${percent}%` }}
                      viewport={{ once: true, amount: 0.6 }}
                      transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
                    />
                  )}
                </div>
                <span className="w-4 shrink-0 text-[10px] text-gray-400">{count}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-gray-500">
        <PackageCheck size={14} className="shrink-0 text-gray-400" />
        {farmer.completedOrders} completed order{farmer.completedOrders === 1 ? '' : 's'}
      </p>

      <Link
        to={`/farmers/${farmer.id}`}
        className="mt-5 inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-green-600 px-4 py-2 text-sm font-semibold text-green-700 transition-all duration-300 hover:-translate-y-0.5 hover:bg-green-600 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600"
      >
        View Profile
      </Link>
    </motion.article>
  );
});

export function FarmerDirectoryCardSkeleton() {
  return (
    <div className="flex h-full animate-pulse flex-col rounded-[24px] border border-gray-100 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.08)]" aria-hidden="true">
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 shrink-0 rounded-full bg-gray-100" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-2/3 rounded bg-gray-100" />
          <div className="h-3 w-1/2 rounded bg-gray-100" />
        </div>
      </div>
      <div className="mt-4 h-3 w-1/3 rounded bg-gray-100" />
      <div className="mt-3 space-y-1.5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-1.5 w-full rounded-full bg-gray-100" />
        ))}
      </div>
      <div className="mt-2 h-3 w-1/2 rounded bg-gray-100" />
      <div className="mt-6 h-9 w-full rounded-full bg-gray-100" />
    </div>
  );
}
