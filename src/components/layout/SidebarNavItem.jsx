import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';

const itemVariants = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0 },
};

export default function SidebarNavItem({ to, label, icon: Icon, badge }) {
  return (
    <motion.div variants={itemVariants}>
      <NavLink
        to={to}
        className={({ isActive }) => `
          group relative flex h-10 items-center gap-2.5 rounded-md px-3 text-[14px]
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
            <span className="truncate">{label}</span>
            {badge > 0 ? (
              <span className="nav-badge ml-auto" aria-label={`${badge > 9 ? '9+' : badge} unread`}>
                {badge > 9 ? '9+' : badge}
              </span>
            ) : null}
          </>
        )}
      </NavLink>
    </motion.div>
  );
}
