import { CircleCheck, Clock3, Shield } from 'lucide-react';
import { getInitials } from '../../utils/formatters';
import './SidebarUserCard.css';

export default function SidebarUserCard({ user, isCollapsed = false }) {
  const isVerifiedFarmer = user.role === 'farmer' && user.verificationStatus === 'verified';
  const isAdmin = user.role === 'admin';
  const isPending = !isAdmin && user.verificationStatus === 'pending';
  const isRejected = !isAdmin && user.verificationStatus === 'rejected';
  const roleLabel = user.role.charAt(0).toUpperCase() + user.role.slice(1);
  const subtitle = isAdmin ? 'Administrator'
    : isPending ? `${roleLabel} · Pending`
      : isRejected ? `${roleLabel} · Rejected`
        : isVerifiedFarmer ? `Verified ${roleLabel}` : roleLabel;

  return (
    <div
      data-role={user.role}
      title={user.name}
      className={`sidebar-user-card${isCollapsed ? ' is-collapsed' : ''}`}
    >
      <span className="sidebar-user-avatar-slot" aria-hidden="true">
        <span className="sidebar-user-avatar flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--green-700)] text-[11.5px] font-semibold text-white">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" /> : getInitials(user.name)}
        </span>
      </span>
      {!isCollapsed ? (
        <span className="sidebar-user-details">
          <span className="sidebar-user-name block truncate text-[13px] font-semibold text-[var(--text)]">{user.name}</span>
          <span className={`sidebar-user-role flex items-center gap-1 text-[11.5px] text-[var(--muted)]${isVerifiedFarmer ? ' sidebar-user-role-verified' : ''}`} title={subtitle}>
            {isAdmin ? <Shield size={12} className="shrink-0" aria-hidden="true" />
              : isVerifiedFarmer ? <CircleCheck size={12} className="shrink-0" aria-hidden="true" />
                : isPending ? <Clock3 size={12} className="shrink-0" aria-hidden="true" /> : null}
            <span className="truncate">{subtitle}</span>
          </span>
        </span>
      ) : null}
    </div>
  );
}
