import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';

const itemVariants = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0 },
};

// 3, not lucide's 2 default — the nav icons read noticeably thin against the sidebar's
// semibold labels at 20px. Every sidebar icon (including Settings and Logout in AppShell, and
// the mobile bottom nav) uses this same weight so none of them looks lighter than its
// neighbors; the one exception is the Nearby pin, a raster PNG with its own baked-in weight.
export const SIDEBAR_ICON_STROKE = 3;

export default function SidebarNavItem({ to, label, icon: Icon, badge, isCollapsed = false, iconStrokeWidth = SIDEBAR_ICON_STROKE }) {
  return (
    <motion.div variants={itemVariants}>
      <NavLink
        to={to}
        // Only source of the label once it's not on screen as text — same content, just
        // read on hover/focus instead of at a glance.
        title={isCollapsed ? label : undefined}
        // Inactive sits at 500 and active at 600 — one step apart, both restrained. With the
        // whole list at a single weight there'd be nothing for the active row to step up to,
        // leaving the green fill to carry the entire active state on its own.
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
        {({ isActive }) => (
          <>
            {/* Inactive icons read slightly more muted than the label text (a deliberate,
                separate shade, not just currentColor) — active icons match the green label. */}
            <span className="sidebar-nav-icon" aria-hidden="true">
              <Icon size={20} strokeWidth={iconStrokeWidth} className={`shrink-0 ${isActive ? '' : 'text-[var(--icon-muted)]'}`} />
            </span>
            {!isCollapsed ? <span className="truncate">{label}</span> : null}
            {badge > 0 ? (
              // Collapsed: no room for the count, so just a plain presence dot — still
              // visible, not a number that would need the label's width back to sit next to.
              isCollapsed ? (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[var(--red-700)]" aria-label={`${badge > 9 ? '9+' : badge} unread`} />
              ) : (
                <span className="nav-badge ml-auto" aria-label={`${badge > 9 ? '9+' : badge} unread`}>
                  {badge > 9 ? '9+' : badge}
                </span>
              )
            ) : null}
            {!isCollapsed ? <span className="sidebar-hover-arrow" aria-hidden="true">&gt;</span> : null}
          </>
        )}
      </NavLink>
    </motion.div>
  );
}
