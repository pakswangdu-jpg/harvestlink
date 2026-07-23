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
          group relative flex h-11 items-center gap-3 rounded-xl px-3.5 text-[15px] font-medium
          transition-colors duration-200
          ${isActive
            ? 'bg-gradient-to-br from-green-700 to-green-900 text-white! shadow-md shadow-green-900/20 before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-white/90 before:content-[""]'
            : 'text-gray-600! hover:bg-green-50 hover:text-green-800!'}
        `.trim().replace(/\s+/g, ' ')}
      >
        <Icon size={20} strokeWidth={2} className="shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
        <span className="truncate">{label}</span>
        {badge > 0 ? <span className="nav-badge ml-auto">{badge > 9 ? '9+' : badge}</span> : null}
      </NavLink>
    </motion.div>
  );
}
