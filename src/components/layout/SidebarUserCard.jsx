import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getInitials } from '../../utils/formatters';

export default function SidebarUserCard({ user, to }) {
  const isVerifiedFarmer = user.role === 'farmer' && user.verificationStatus === 'verified';

  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
      <Link
        to={to}
        className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-3.5 py-3 shadow-sm transition-shadow duration-200 hover:shadow-md hover:shadow-gray-200/70"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-green-700 text-sm font-semibold text-white">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" /> : getInitials(user.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold text-gray-900">{user.name}</span>
            {isVerifiedFarmer ? (
              <span className="shrink-0 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-800">
                Verified
              </span>
            ) : null}
          </span>
          <span className="block truncate text-[12px] text-gray-500">{user.email}</span>
        </span>
      </Link>
    </motion.div>
  );
}
