import { Link } from 'react-router-dom';
import { getInitials } from '../../utils/formatters';

export default function SidebarUserCard({ user, to }) {
  const isVerifiedFarmer = user.role === 'farmer' && user.verificationStatus === 'verified';
  const roleLabel = user.role.charAt(0).toUpperCase() + user.role.slice(1);
  const subtitle = isVerifiedFarmer ? `Verified ${roleLabel}` : roleLabel;

  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 rounded-md px-3 py-2 transition-colors duration-150 hover:bg-[var(--green-50)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--green-700)]"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--green-700)] text-[12px] font-semibold text-white">
        {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" /> : getInitials(user.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-[var(--text)]">{user.name}</span>
        <span className="block truncate text-[12px] text-[var(--muted)]">{subtitle}</span>
      </span>
    </Link>
  );
}
