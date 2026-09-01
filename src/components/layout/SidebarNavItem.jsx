import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import NotificationBadge from '../common/NotificationBadge';

const itemVariants = { hidden: { opacity: 0, x: -12 }, show: { opacity: 1, x: 0 } };

// A slightly stronger-than-default Lucide stroke keeps navigation icons legible at 20px.
export const SIDEBAR_ICON_STROKE = 3;

export default function SidebarNavItem({ to, label, icon: Icon, badge, isCollapsed = false, iconStrokeWidth = SIDEBAR_ICON_STROKE }) {
  const accessibleLabel = badge > 0
    ? `${label}, ${badge > 9 ? '9 or more' : badge} items needing attention`
    : label;

  return (
    <motion.div variants={itemVariants}>
      <NavLink
        to={to}
        aria-label={accessibleLabel}
        title={isCollapsed ? label : undefined}
        className={({ isActive }) => `
          sidebar-nav-link group relative flex h-9 items-center gap-2.5 rounded-md text-[14px]
          ${isCollapsed ? 'justify-center px-0' : 'px-2.5'}
          transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-[var(--green-700)]
          ${isActive
            ? 'bg-[var(--green-100)] font-semibold text-[var(--green-700)]! before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-[var(--green-700)] before:content-[""]'
            : 'font-medium text-[var(--text)]! hover:bg-[var(--green-50)]'}
        `.trim().replace(/\s+/g, ' ')}
      >
        {({ isActive }) => <>
          <span className="sidebar-nav-icon" aria-hidden="true"><Icon size={20} strokeWidth={iconStrokeWidth} className={`shrink-0 ${isActive ? '' : 'text-[var(--icon-muted)]'}`} /></span>
          {!isCollapsed ? <span className="truncate">{label}</span> : null}
          {!isCollapsed ? (
            <span className="sidebar-nav-trailing">
              <NotificationBadge count={badge} collapsed={isCollapsed} />
              <span className="sidebar-hover-arrow" aria-hidden="true">&gt;</span>
            </span>
          ) : (
            <NotificationBadge count={badge} collapsed={isCollapsed} />
          )}
        </>}
      </NavLink>
    </motion.div>
  );
}
