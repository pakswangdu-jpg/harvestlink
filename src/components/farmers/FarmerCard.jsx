import { memo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Calendar, MapPin, MessageCircle, PackageCheck,
} from 'lucide-react';
import verifiedIcon from '../../assets/icons/verified-farmer.png';
import StarRating from '../common/StarRating';
import { getInitials } from '../../utils/formatters';

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

function memberSinceLabel(createdAt) {
  if (!createdAt) return null;
  const years = Math.floor((Date.now() - new Date(createdAt).getTime()) / MS_PER_YEAR);
  return years < 1 ? 'New this year' : `${years} yr${years === 1 ? '' : 's'} selling`;
}

// The "All Verified Farmers" directory's card — deliberately its own component rather than
// a reuse of FarmerDirectoryCard (the landing page carousel's compact card): this one carries
// more information (category chips, tenure, a Message action) than fits a marketing carousel
// slide. Memoized since the grid can re-render on every search/sort/filter keystroke.
//
// Every row below reserves its height even when its content is absent (a blank farm name
// renders a non-breaking space, a missing tenure keeps its grid cell) — that's what keeps the
// rating/meta/chip rows landing at the same y-position on every card in a row, not just the
// outer card height matching (which the grid's own row-stretch already guarantees).
export const FarmerCard = memo(function FarmerCard({ farmer }) {
  const tenure = memberSinceLabel(farmer.createdAt);

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="group flex h-full flex-col gap-4 rounded-[20px] border border-gray-200 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[box-shadow,border-color] duration-200 hover:border-green-600 hover:shadow-[0_12px_24px_rgba(16,24,40,0.08)]"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-green-50 text-base font-semibold text-green-800 transition-transform duration-200 group-hover:scale-[1.03]">
          {farmer.avatarUrl ? (
            <img src={farmer.avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            getInitials(farmer.name)
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <h3 title={farmer.name} className="min-w-0 truncate text-base font-semibold leading-5 text-gray-900">
              {farmer.name}
            </h3>
            <img src={verifiedIcon} alt="Verified farmer" width={16} height={16} className="h-4 w-4 shrink-0 object-contain" />
          </div>
          <p title={farmer.farmName || undefined} className="truncate text-[13px] font-semibold uppercase leading-4 tracking-wide text-gray-400">
            {farmer.farmName || ' '}
          </p>
          <p className="flex items-center gap-1 text-[13px] leading-4 text-gray-500">
            <MapPin size={12} className="shrink-0" />
            <span className="truncate">{farmer.municipality}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <StarRating value={farmer.avgRating} size={14} />
        <span className="text-sm font-semibold leading-none text-gray-900">{farmer.avgRating.toFixed(1)}</span>
        <span className="text-xs leading-none text-gray-400">({farmer.ratingCount})</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs leading-none text-gray-500">
        <span className="flex min-w-0 items-center gap-1.5">
          <PackageCheck size={13} className="shrink-0 text-gray-400" />
          <span className="truncate">{farmer.completedOrders} order{farmer.completedOrders === 1 ? '' : 's'}</span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          {tenure ? <Calendar size={13} className="shrink-0 text-gray-400" /> : null}
          <span className="truncate">{tenure}</span>
        </span>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <div className="flex min-h-[26px] flex-wrap items-start gap-1.5">
          {farmer.categories?.map((category) => (
            <span
              key={category}
              className="rounded-full border border-gray-200 px-2.5 py-0.5 text-[11px] font-medium leading-4 text-gray-600"
            >
              {category}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2">
        <Link
          to={`/farmers/${farmer.id}`}
          className="flex h-11 flex-1 items-center justify-center rounded-lg bg-green-800 text-sm font-semibold leading-none text-white transition-colors duration-200 hover:bg-green-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
        >
          View Profile
        </Link>
        <Link
          to={`/messages/direct/${farmer.id}`}
          aria-label={`Message ${farmer.name}`}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 text-sm font-semibold leading-none text-gray-700 transition-colors duration-200 hover:bg-green-50 hover:text-green-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
        >
          <MessageCircle size={15} /> Message
        </Link>
      </div>
    </motion.article>
  );
});

export function FarmerCardSkeleton() {
  return (
    <div
      className="flex h-full animate-pulse flex-col gap-4 rounded-[20px] border border-gray-200 bg-white p-6"
      aria-hidden="true"
    >
      <div className="flex items-start gap-3">
        <div className="h-14 w-14 shrink-0 rounded-full bg-gray-100" />
        <div className="flex flex-1 flex-col gap-2 pt-0.5">
          <div className="h-4 w-2/3 rounded bg-gray-100" />
          <div className="h-3 w-1/2 rounded bg-gray-100" />
          <div className="h-3 w-2/5 rounded bg-gray-100" />
        </div>
      </div>
      <div className="h-3.5 w-1/3 rounded bg-gray-100" />
      <div className="h-3 w-1/2 rounded bg-gray-100" />
      <div className="border-t border-gray-100 pt-4">
        <div className="flex gap-1.5">
          <div className="h-[22px] w-16 rounded-full bg-gray-100" />
          <div className="h-[22px] w-16 rounded-full bg-gray-100" />
        </div>
      </div>
      <div className="mt-auto flex gap-2">
        <div className="h-11 flex-1 rounded-lg bg-gray-100" />
        <div className="h-11 flex-1 rounded-lg bg-gray-100" />
      </div>
    </div>
  );
}
