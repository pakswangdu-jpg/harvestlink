import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import NotificationBadge from '../common/NotificationBadge';

const itemVariants = { hidden: { opacity: 0, x: -12 }, show: { opacity: 1, x: 0 } };


export const SIDEBAR_ICON_STROKE = 2;

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
          sidebar-nav-link group relative flex items-center
          ${isCollapsed ? 'justify-center px-0' : 'px-3'}
          ${isActive ? 'active' : ''}
        `.trim().replace(/\s+/g, ' ')}
      >
        {() => (
          <>
            <span className="sidebar-nav-icon" aria-hidden="true">
              <Icon size={19} strokeWidth={iconStrokeWidth} className="shrink-0" />
            </span>
            {!isCollapsed ? <span className="sidebar-nav-label truncate">{label}</span> : null}
            {!isCollapsed ? (
              <span className="sidebar-nav-trailing">
                <NotificationBadge count={badge} collapsed={isCollapsed} />
              </span>
            ) : (
              <NotificationBadge count={badge} collapsed={isCollapsed} />
            )}
          </>
        )}
      </NavLink>
    </motion.div>
  );
}
