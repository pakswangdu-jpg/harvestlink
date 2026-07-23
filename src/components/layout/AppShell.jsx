import { Link, NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogOut, Settings } from 'lucide-react';
import Button from '../common/Button';
import NotificationBell from '../notifications/NotificationBell';
import SidebarNavItem from './SidebarNavItem';
import SidebarUserCard from './SidebarUserCard';
import { ROLE_DASHBOARDS } from '../../utils/constants';
import { useAuth } from '../../features/auth/AuthContext';
import { useFarmerActiveDeliverySharing } from '../../hooks/useFarmerActiveDeliverySharing';
import { useFarmerNavBadges } from '../../hooks/useFarmerNavBadges';
import { useBuyerNavBadges } from '../../hooks/useBuyerNavBadges';
import { useStakeholderNavBadges } from '../../hooks/useStakeholderNavBadges';
import logo from '../../assets/logo.png';

const navListVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

export default function AppShell({ user, navItems, title, subtitle, children }) {
  const { logout } = useAuth();
  const hasProfile = ['farmer', 'buyer', 'stakeholder'].includes(user.role);
  // Mounted here (not on the order tracking page) so GPS sharing starts the instant an order
  // goes "out for delivery" no matter which page the farmer used to mark it that way — the
  // order detail page, the orders list, etc. all call the same backend action.
  const { error: locationSharingError } = useFarmerActiveDeliverySharing(user.role === 'farmer' ? user.id : null);
  // Same "pending action" badge concept as the admin sidebar (see AdminDashboard.jsx), just
  // computed here instead of inside one page so it shows up regardless of which page of
  // theirs is currently open. Each hook is a no-op (returns 0, does nothing) unless the
  // signed-in account is actually that role, so all three can always be called.
  const farmerBadges = useFarmerNavBadges(user.role === 'farmer' ? user.id : null);
  const buyerBadges = useBuyerNavBadges(user.role === 'buyer' ? user.id : null);
  const stakeholderBadges = useStakeholderNavBadges(user.role === 'stakeholder' ? user.id : null);

  const BADGE_TARGETS_BY_ROLE = {
    farmer: { '/farmer-orders': farmerBadges.ordersBadge, '/farmer-donations': farmerBadges.donationsBadge },
    buyer: { '/buyer-orders': buyerBadges.ordersBadge },
    stakeholder: {
      '/stakeholder-orders': stakeholderBadges.ordersBadge,
      '/stakeholder-donations': stakeholderBadges.donationsBadge,
      '/stakeholder-requests': stakeholderBadges.requestsBadge,
    },
  };
  const badgesByPath = BADGE_TARGETS_BY_ROLE[user.role];
  const navItemsWithBadges = badgesByPath
    ? navItems.map((item) => (item.to in badgesByPath ? { ...item, badge: badgesByPath[item.to] } : item))
    : navItems;

  // The desktop sidebar promotes Profile into a rich user card under GENERAL instead of a
  // plain menu row; the mobile bottom nav keeps the full list (Profile included) unchanged.
  const menuItems = navItemsWithBadges.filter((item) => item.label !== 'Profile');
  const profileItem = navItemsWithBadges.find((item) => item.label === 'Profile');

  const handleLogout = () => {
    // A client-side navigate() here raced with ProtectedRoute's own "no user -> /login"
    // redirect and lost (React Router kept matching the old protected route for a beat
    // after the session cleared). A full navigation sidesteps that entirely: the app
    // reboots fresh at "/" with no session and no protected route in the picture.
    logout();
    window.location.href = '/';
  };

  return (
    <div className="app-shell">
      <motion.aside
        className="sidebar"
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <Link className="brand" to={ROLE_DASHBOARDS[user.role]}>
          <span className="brand-mark">
            <img src={logo} alt="" />
          </span>
          <span>
            <strong>HarvestLink</strong>
            <small>{user.role} workspace</small>
          </span>
        </Link>

        <div className="sidebar-scroll flex flex-1 flex-col gap-6 overflow-y-auto">
          <div>
            <p className="px-3.5 pb-2 text-[11px] font-semibold uppercase tracking-widest text-gray-400">Menu</p>
            <motion.nav className="flex flex-col gap-1" variants={navListVariants} initial="hidden" animate="show">
              {menuItems.map((item) => (
                <SidebarNavItem key={item.to} to={item.to} label={item.label} icon={item.icon} badge={item.badge} />
              ))}
            </motion.nav>
          </div>

          <div className="flex flex-col gap-2">
            <p className="px-3.5 pb-2 text-[11px] font-semibold uppercase tracking-widest text-gray-400">General</p>
            {profileItem ? <SidebarUserCard user={user} to={profileItem.to} /> : null}
            {profileItem ? <SidebarNavItem to={profileItem.to} label="Settings" icon={Settings} /> : null}
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="group flex h-11 items-center gap-3 rounded-xl border-0 bg-transparent px-3.5 text-[15px] font-medium text-gray-600 transition-colors duration-200 hover:bg-red-50 hover:text-red-700"
        >
          <LogOut size={20} strokeWidth={2} className="shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
          Logout
        </button>
      </motion.aside>

      <main className="main-content">
        <header className="page-header">
          <div>
            <p className="eyebrow">Cebu farm-to-market</p>
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {hasProfile ? <NotificationBell userId={user.id} /> : null}
        </header>
        {locationSharingError ? <div className="form-alert error">{locationSharingError}</div> : null}
        {children}
      </main>

      <nav className="mobile-bottom-nav">
        <div className="mobile-bottom-nav-scroll">
          {navItemsWithBadges.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              <item.icon size={20} strokeWidth={2} />
              <span>{item.label}</span>
              {item.badge > 0 ? <span className="nav-badge">{item.badge > 9 ? '9+' : item.badge}</span> : null}
            </NavLink>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut size={20} strokeWidth={2} />
        </Button>
      </nav>
    </div>
  );
}
