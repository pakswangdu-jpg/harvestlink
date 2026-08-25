import { Link } from 'react-router-dom';
import { getInitials } from '../../utils/formatters';

export default function SidebarUserCard({ user, to, isCollapsed = false }) {
  const isVerifiedFarmer = user.role === 'farmer' && user.verificationStatus === 'verified';
  const roleLabel = user.role.charAt(0).toUpperCase() + user.role.slice(1);
  const subtitle = isVerifiedFarmer ? `Verified ${roleLabel}` : roleLabel;

  return (
    <Link
      to={to}
      title={isCollapsed ? user.name : undefined}
      className={`flex items-center gap-2.5 rounded-md py-1.5 transition-colors duration-150 hover:bg-[var(--green-50)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--green-700)] ${isCollapsed ? 'justify-center px-0' : 'px-2.5'}`}
    >
      <span className="sidebar-user-avatar-slot" aria-hidden="true">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--green-700)] text-[11.5px] font-semibold text-white">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" /> : getInitials(user.name)}
        </span>
      </span>
      {!isCollapsed ? (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-[var(--text)]">{user.name}</span>
          <span className="block truncate text-[11.5px] text-[var(--muted)]">{subtitle}</span>
        </span>
      ) : null}
    </Link>
  );
}
