import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, LogOut, Settings } from 'lucide-react';
import Button from '../common/Button';
import NotificationBell from '../notifications/NotificationBell';
import CartButton from '../cart/CartButton';
import SidebarNavItem from './SidebarNavItem';
import SidebarUserCard from './SidebarUserCard';
import { ORDERING_ROLES, ROLE_DASHBOARDS } from '../../utils/constants';
import { useAuth } from '../../features/auth/AuthContext';
import { useFarmerActiveDeliverySharing } from '../../hooks/useFarmerActiveDeliverySharing';
import { useBuyerActivePickupSharing } from '../../hooks/useBuyerActivePickupSharing';
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

// Determines section order for nav items that declare a `group` (currently just farmerNav.js).
// Items with no `group` — every other role's nav config — all land in the "Menu" bucket, which
// reproduces today's single flat list exactly, so this is additive rather than a behavior change.
const NAV_GROUP_ORDER = ['Menu', 'Sales', 'Market', 'Community'];

// Desktop-only (the sidebar itself is display:none below 1080px in favor of the mobile
// bottom nav — see globals.css — so this never applies there). Persisted across navigations
// and future visits: every page mounts its own <AppShell>, so component state alone would
// reset to expanded on every single click through the app.
const SIDEBAR_COLLAPSED_KEY = 'harvestlink:sidebarCollapsed';

export default function AppShell({
  user, navItems, title, subtitle, eyebrow = 'Cebu farm-to-market', children, fullBleed = false, wide = false, hideHeader = false, headerActions = null,
}) {
  const { logout } = useAuth();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  );
  const toggleSidebarCollapsed = () => {
    setIsSidebarCollapsed((previous) => {
      const next = !previous;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  };
  const hasProfile = ['farmer', 'buyer', 'stakeholder'].includes(user.role);
  // Mounted here (not on the order tracking page) so GPS sharing starts the instant an order
  // goes "out for delivery" no matter which page the farmer used to mark it that way — the
  // order detail page, the orders list, etc. all call the same backend action.
  const { error: locationSharingError } = useFarmerActiveDeliverySharing(user.role === 'farmer' ? user.id : null);
  // The buyer_pickup mirror of the hook above — "buyer" here means whoever placed the order
  // (buyer_id ownership), same as everywhere else in this app; a stakeholder checking out
  // through the marketplace can choose pickup too, so this covers both roles, not just
  // literal role === 'buyer'.
  const { error: pickupSharingError } = useBuyerActivePickupSharing(['buyer', 'stakeholder'].includes(user.role) ? user.id : null);
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

  // Buckets menuItems by their declared `group`, defaulting ungrouped items into "Menu".
  const menuGroups = useMemo(() => {
    const byLabel = new Map();
    menuItems.forEach((item) => {
      const label = item.group || 'Menu';
      if (!byLabel.has(label)) byLabel.set(label, []);
      byLabel.get(label).push(item);
    });
    const orderedLabels = [
      ...NAV_GROUP_ORDER.filter((label) => byLabel.has(label)),
      ...[...byLabel.keys()].filter((label) => !NAV_GROUP_ORDER.includes(label)),
    ];
    return orderedLabels.map((label) => ({ label, items: byLabel.get(label) }));
  }, [menuItems]);

  const handleLogout = () => {
    // A client-side navigate() here raced with ProtectedRoute's own "no user -> /login"
    // redirect and lost (React Router kept matching the old protected route for a beat
    // after the session cleared). A full navigation sidesteps that entirely: the app
    // reboots fresh at "/" with no session and no protected route in the picture.
    logout();
    window.location.href = '/';
  };

  return (
    <div className={`app-shell ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`.trim()}>
      <motion.aside
        className="sidebar"
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <div className="sidebar-brand-row">
          <Link className="brand" to={ROLE_DASHBOARDS[user.role]}>
            <span className="brand-mark">
              <img src={logo} alt="" />
            </span>
            {!isSidebarCollapsed ? (
              <span>
                <strong>HarvestLink</strong>
                <small>{user.role} workspace</small>
              </span>
            ) : null}
          </Link>
          <button
            type="button"
            className="sidebar-collapse-toggle"
            onClick={toggleSidebarCollapsed}
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isSidebarCollapsed ? <ChevronRight size={15} strokeWidth={2.25} /> : <ChevronLeft size={15} strokeWidth={2.25} />}
          </button>
        </div>

        <div className="sidebar-scroll flex flex-col gap-4">
          <nav aria-label="Primary" className="flex flex-col gap-4">
            {menuGroups.map((group) => (
              <div key={group.label}>
                {!isSidebarCollapsed ? (
                  <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{group.label}</p>
                ) : null}
                <motion.div className="flex flex-col gap-1" variants={navListVariants} initial="hidden" animate="show">
                  {group.items.map((item) => (
                    <SidebarNavItem
                      key={item.to}
                      to={item.to}
                      label={item.label}
                      icon={item.icon}
                      badge={item.badge}
                      isCollapsed={isSidebarCollapsed}
                    />
                  ))}
                </motion.div>
              </div>
            ))}
          </nav>

          <div className="flex flex-col gap-1">
            {!isSidebarCollapsed ? (
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">General</p>
            ) : null}
            {profileItem ? <SidebarUserCard user={user} to={profileItem.to} isCollapsed={isSidebarCollapsed} /> : null}
            {profileItem ? (
              <SidebarNavItem to={profileItem.to} label="Settings" icon={Settings} isCollapsed={isSidebarCollapsed} />
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          title={isSidebarCollapsed ? 'Logout' : undefined}
          className={`flex h-10 items-center gap-2.5 rounded-md border-0 bg-transparent text-[14px] font-medium text-[var(--text)] transition-colors duration-150 hover:bg-[var(--red-100)] hover:text-[var(--red-700)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--green-700)] ${isSidebarCollapsed ? 'justify-center px-0' : 'px-3'}`}
        >
          <LogOut size={20} strokeWidth={2} className="shrink-0" aria-hidden="true" />
          {!isSidebarCollapsed ? 'Logout' : null}
        </button>
      </motion.aside>

      {/* .sidebar is display:none under the same breakpoint that switches on
          .mobile-bottom-nav (see globals.css) — without this, the logo/HarvestLink brand
          disappeared entirely below 1080px, since it only ever lived inside .sidebar. Hidden
          on desktop (display:none by default, only switched on inside that same media query)
          so there's never a duplicate logo once the real sidebar is visible again. Skipped for
          fullBleed pages (MessagesPage) — that layout locks to an exact 100vh for its own
          internal split-pane scroll, and this would push it taller than the viewport. */}
      {!fullBleed ? (
        <Link className="brand mobile-topbar" to={ROLE_DASHBOARDS[user.role]}>
          <span className="brand-mark">
            <img src={logo} alt="" />
          </span>
          <span>
            <strong>HarvestLink</strong>
            <small>{user.role} workspace</small>
          </span>
        </Link>
      ) : null}

      {/* fullBleed locks .main-content to a fixed height:100vh (see globals.css) for pages that
          manage their own internal scroll region edge-to-edge — genuinely only MessagesPage.
          Admin pages that just want "no built-in header, no max-width cap" (their content is a
          normal, page-scrolling column of stacked cards/tables) should pass hideHeader alone
          instead, which applies main-content-flush — the same full-width layout minus the
          height lock, which broke natural mobile scrolling on those pages since their stacked
          content is almost always taller than one viewport. */}
      <main
        className={`main-content ${fullBleed ? 'main-content-full-bleed' : ''} ${!fullBleed && hideHeader ? 'main-content-flush' : ''} ${wide ? 'main-content-wide' : ''}`
          .trim().replace(/\s+/g, ' ')}
      >
        {!fullBleed && !hideHeader ? (
          <header className="page-header">
            <div>
              <p className="eyebrow">{eyebrow}</p>
              <h1>{title}</h1>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
            <div className="page-header-actions">
              {headerActions}
              {ORDERING_ROLES.includes(user.role) ? <CartButton /> : null}
              {hasProfile ? <NotificationBell userId={user.id} /> : null}
            </div>
          </header>
        ) : null}
        {locationSharingError ? <div className="form-alert error">{locationSharingError}</div> : null}
        {pickupSharingError ? <div className="form-alert error">{pickupSharingError}</div> : null}
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
