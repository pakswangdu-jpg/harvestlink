import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';

const itemVariants = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0 },
};

export default function SidebarNavItem({ to, label, icon: Icon, badge, isCollapsed = false }) {
  return (
    <motion.div variants={itemVariants}>
      <NavLink
        to={to}
        // Only source of the label once it's not on screen as text — same content, just
        // read on hover/focus instead of at a glance.
        title={isCollapsed ? label : undefined}
        className={({ isActive }) => `
          group relative flex h-10 items-center gap-2.5 rounded-md text-[14px]
          ${isCollapsed ? 'justify-center px-0' : 'px-3'}
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
            <Icon size={20} strokeWidth={2} className={`shrink-0 ${isActive ? '' : 'text-[var(--icon-muted)]'}`} aria-hidden="true" />
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
          </>
        )}
      </NavLink>
    </motion.div>
  );
}
