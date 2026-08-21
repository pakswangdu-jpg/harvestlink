import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, BadgeCheck, ChevronDown, Globe, Star, Store, User,
} from 'lucide-react';
import { getRatingsForFarmer } from '../../services/ratingService';
import { MESSAGE_TRANSLATION_LANGUAGES } from '../../services/translateService';
import { formatRelativeTime, getInitials, isRecentlyActive } from '../../utils/formatters';

// Real average — fetched and computed from this farmer's actual ratings, never a fabricated
// or placeholder number. Silently shows nothing if there are no ratings yet or the other
// party isn't a farmer, rather than a fake "New" badge or a made-up score.
function useFarmerRating(farmerId) {
  // Keyed on which farmerId the loaded summary is actually for, rather than resetting state
  // synchronously inside the effect — a stale summary from a previous farmer never leaks
  // into view while a new one loads (or when there's no farmer at all).
  const [state, setState] = useState({ farmerId: null, summary: null });
  useEffect(() => {
    if (!farmerId) return undefined;
    let cancelled = false;
    getRatingsForFarmer(farmerId).then((ratings) => {
      if (cancelled || !ratings.length) return;
      const average = ratings.reduce((sum, entry) => sum + entry.rating, 0) / ratings.length;
      setState({ farmerId, summary: { average, count: ratings.length } });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [farmerId]);
  return state.farmerId === farmerId ? state.summary : null;
}

export default function ChatHeader({
  otherParty, onBack, isMobile, viewProductsHref, targetLang, onTargetLangChange,
}) {
  const rating = useFarmerRating(otherParty?.role === 'farmer' ? otherParty.id : null);
  const displayName = otherParty ? (otherParty.organizationName || otherParty.farmName || otherParty.name) : '';
  const online = isRecentlyActive(otherParty?.lastActiveAt);
  const presenceLabel = online
    ? 'Active now'
    : otherParty?.lastActiveAt
      ? `Active ${formatRelativeTime(otherParty.lastActiveAt)}`
      : 'Offline';

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--panel)]/95 px-4 py-3 backdrop-blur-sm">
      <div className="flex min-w-0 items-center gap-3">
        {isMobile ? (
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-[var(--muted)] transition-colors duration-150 hover:bg-[var(--soft)] hover:text-[var(--text)]"
          >
            <ArrowLeft size={20} />
          </button>
        ) : null}

        <div className="relative shrink-0">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-[var(--green-100)] text-[13px] font-semibold text-[var(--green-800)]">
            {otherParty?.avatarUrl ? (
              <img src={otherParty.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              getInitials(displayName)
            )}
          </div>
          <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--panel)] ${online ? 'bg-[var(--green-700)]' : 'bg-[var(--line)]'}`} />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[15px] font-bold text-[var(--text)]">{displayName || 'Loading…'}</p>
            {otherParty?.verificationStatus === 'verified' ? (
              <BadgeCheck size={15} className="shrink-0 text-[var(--green-700)]" aria-label="Verified" />
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-[12px] text-[var(--muted)]">
            <span>{presenceLabel}</span>
            {rating ? (
              <span className="flex items-center gap-0.5 text-[var(--amber-700)]">
                <Star size={11} className="fill-[var(--amber-700)] text-[var(--amber-700)]" /> {rating.average.toFixed(1)} ({rating.count})
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <label className="hidden items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1.5 text-[12px] font-medium text-[var(--muted)] sm:flex" htmlFor="translate-lang">
          <Globe size={14} className="shrink-0 text-[var(--muted)]" />
          <select
            id="translate-lang"
            value={targetLang}
            onChange={(event) => onTargetLangChange(event.target.value)}
            className="appearance-none border-0 bg-transparent p-0 focus:outline-none"
          >
            {MESSAGE_TRANSLATION_LANGUAGES.map((lang) => <option key={lang.value} value={lang.value}>{lang.label}</option>)}
          </select>
          <ChevronDown size={12} className="pointer-events-none -ml-1 shrink-0 text-[var(--muted)]" />
        </label>

        {otherParty?.role === 'farmer' && viewProductsHref ? (
          <Link
            to={viewProductsHref}
            className="hidden items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1.5 text-[12px] font-semibold text-[var(--muted)] transition-colors duration-150 hover:border-[var(--green-100)] hover:text-[var(--green-700)] sm:flex"
          >
            <Store size={13} /> Products
          </Link>
        ) : null}

        {otherParty?.role === 'farmer' ? (
          <Link
            to={`/farmers/${otherParty.id}`}
            className="hidden items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1.5 text-[12px] font-semibold text-[var(--muted)] transition-colors duration-150 hover:border-[var(--green-100)] hover:text-[var(--green-700)] sm:flex"
          >
            <User size={13} /> Profile
          </Link>
        ) : null}
      </div>
    </div>
  );
}
