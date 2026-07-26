import { useEffect, useRef } from 'react';
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
import { useAdminNavBadges } from '../../hooks/useAdminNavBadges';
import { useMessagesBadge } from '../../hooks/useMessagesBadge';
import logo from '../../assets/logo.png';

const navListVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

export default function AppShell({
  user, navItems, title, subtitle, children, fullBleed = false, wide = false,
}) {
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
  const adminBadges = useAdminNavBadges(user.role === 'admin');
  // "Messages" is identical across farmer/buyer/stakeholder (unlike the other, per-role
  // badges above) — one shared hook instead of duplicating the same unread-count logic
  // three times. Admin has no Messages nav item, so this is a no-op for that role.
  const messagesBadges = useMessagesBadge(hasProfile ? user.id : null);

  const BADGE_TARGETS_BY_ROLE = {
    farmer: {
      '/farmer-orders': farmerBadges.ordersBadge,
      '/farmer-donations': farmerBadges.donationsBadge,
      '/messages': messagesBadges.messagesBadge,
    },
    buyer: {
      '/buyer-orders': buyerBadges.ordersBadge,
      '/messages': messagesBadges.messagesBadge,
    },
    stakeholder: {
      '/stakeholder-orders': stakeholderBadges.ordersBadge,
      '/stakeholder-donations': stakeholderBadges.donationsBadge,
      '/stakeholder-requests': stakeholderBadges.requestsBadge,
      '/messages': messagesBadges.messagesBadge,
    },
    admin: {
      '/admin-users': adminBadges.usersBadge,
      '/admin-price-monitoring': adminBadges.priceMonitoringBadge,
    },
  };
  const badgesByPath = BADGE_TARGETS_BY_ROLE[user.role];
  const navItemsWithBadges = badgesByPath
    ? navItems.map((item) => (item.to in badgesByPath ? { ...item, badge: badgesByPath[item.to] } : item))
    : navItems;

  // Every page renders its own <AppShell>, so this whole component — including the mobile
  // nav's horizontally-scrollable strip — unmounts and remounts on every navigation, which
  // resets its scroll position back to the start. Without this, tapping an item near the end
  // of the strip would navigate there and then immediately "snap back" to showing the first
  // few icons instead of staying put on the one just tapped. Instant (not smooth) on purpose
  // — this should look like it was already positioned there, not visibly scroll on load.
  const mobileNavScrollRef = useRef(null);
  useEffect(() => {
    mobileNavScrollRef.current?.querySelector('a.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, []);

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

        <div className="sidebar-scroll flex flex-col gap-4">
          <div>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">Menu</p>
            <motion.nav className="flex flex-col gap-1" variants={navListVariants} initial="hidden" animate="show">
              {menuItems.map((item) => (
                <SidebarNavItem key={item.to} to={item.to} label={item.label} icon={item.icon} badge={item.badge} />
              ))}
            </motion.nav>
          </div>

          <div className="flex flex-col gap-1">
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">General</p>
            {profileItem ? <SidebarUserCard user={user} to={profileItem.to} /> : null}
            {profileItem ? <SidebarNavItem to={profileItem.to} label="Settings" icon={Settings} /> : null}
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="flex h-10 items-center gap-2.5 rounded-md border-0 bg-transparent px-3 text-[14px] font-medium text-gray-600 transition-colors duration-150 hover:bg-red-50 hover:text-red-700"
        >
          <LogOut size={18} strokeWidth={2} className="shrink-0" />
          Logout
        </button>
      </motion.aside>

      <main className={`main-content ${fullBleed ? 'main-content-full-bleed' : ''} ${wide ? 'main-content-wide' : ''}`.trim().replace(/\s+/g, ' ')}>
        {!fullBleed ? (
          <header className="page-header">
            <div>
              <p className="eyebrow">Cebu farm-to-market</p>
              <h1>{title}</h1>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
            {hasProfile ? <NotificationBell userId={user.id} /> : null}
          </header>
        ) : null}
        {locationSharingError ? <div className="form-alert error">{locationSharingError}</div> : null}
        {children}
      </main>

      <nav className="mobile-bottom-nav">
        <div className="mobile-bottom-nav-scroll" ref={mobileNavScrollRef}>
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
