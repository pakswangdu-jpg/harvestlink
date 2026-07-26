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
          transition-colors duration-150
          ${isActive
            ? 'bg-[#dcfce7] font-semibold text-[#166534]! before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-[#15803d] before:content-[""]'
            : 'font-medium text-gray-600! hover:bg-gray-100'}
        `.trim().replace(/\s+/g, ' ')}
      >
        <Icon size={18} strokeWidth={2} className="shrink-0" />
        <span className="truncate">{label}</span>
        {badge > 0 ? <span className="nav-badge ml-auto">{badge > 9 ? '9+' : badge}</span> : null}
      </NavLink>
    </motion.div>
  );
}
