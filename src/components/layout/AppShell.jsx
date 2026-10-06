import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, LogOut, Settings } from 'lucide-react';
import BrandWordmark from '../common/BrandWordmark';
import NotificationBell from '../notifications/NotificationBell';
import CartButton from '../cart/CartButton';
import SidebarNavItem, { SIDEBAR_ICON_STROKE } from './SidebarNavItem';
import SidebarUserCard from './SidebarUserCard';
import MobileBottomNav from './MobileBottomNav';
import ThemeToggle from '../common/ThemeToggle';
import LocationPermissionNotice from '../common/LocationPermissionNotice';
import { useLocationPermission } from '../../hooks/useLocationPermission';
import { ORDERING_ROLES, ROLE_DASHBOARDS } from '../../utils/constants';
import { useLogout } from '../../hooks/useLogout';
import { useFarmerActiveDeliverySharing } from '../../hooks/useFarmerActiveDeliverySharing';
import { useBuyerActivePickupSharing } from '../../hooks/useBuyerActivePickupSharing';
import { useNavItemsWithBadges } from '../../hooks/useNavItemsWithBadges';
import logo from '../../assets/logo.png';
import './HeaderUtilityControls.css';

const navListVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};




const NAV_GROUP_ORDER = ['Main', 'Orders', 'Sales', 'Market', 'Community', 'Menu'];





const SIDEBAR_COLLAPSED_KEY = 'harvestlink:sidebarCollapsed';

export default function AppShell({
  user, navItems, title, subtitle, eyebrow = 'Cebu farm-to-market', children, fullBleed = false, wide = false, hideHeader = false, headerActions = null, pageClassName = '',
}) {
  const { handleLogout, isLoggingOut } = useLogout();
  const location = useLocation();
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
  const locationAccess = useLocationPermission(hasProfile);



  const { error: locationSharingError } = useFarmerActiveDeliverySharing(user.role === 'farmer' ? user.id : null, locationAccess.permission);




  const { error: pickupSharingError } = useBuyerActivePickupSharing(['buyer', 'stakeholder'].includes(user.role) ? user.id : null, locationAccess.permission);


  const navItemsWithBadges = useNavItemsWithBadges(user, navItems);



  const menuItems = navItemsWithBadges.filter((item) => item.label !== 'Profile');
  const profileItem = navItemsWithBadges.find((item) => item.label === 'Profile');
  const isCheckoutPage = location.pathname.startsWith('/products/');
  const breadcrumbParent = isCheckoutPage
    ? 'Checkout'
    : location.pathname.includes('/pay/')
      || location.pathname.endsWith('/confirmation')
      ? 'Checkout'
      : location.pathname.startsWith('/orders/')
        ? 'My Orders'
        : null;


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

  return (
    <div className={`app-shell role-${user.role} ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`.trim()}>
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
                <strong><BrandWordmark /></strong>
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

        <div className="sidebar-scroll">
          <nav aria-label="Primary" className="flex flex-col gap-3.5">
            {menuGroups.map((group) => (
              <div key={group.label}>
                {!isSidebarCollapsed ? (
                  <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{group.label}</p>
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
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-general flex flex-col gap-1">
            {!isSidebarCollapsed ? (
              <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">General</p>
            ) : null}
            {profileItem ? (
              <SidebarNavItem to={profileItem.to} label="Settings" icon={Settings} isCollapsed={isSidebarCollapsed} />
            ) : null}
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            aria-busy={isLoggingOut}
            aria-label="Logout"
            title={isSidebarCollapsed ? 'Logout' : undefined}







            className={`sidebar-logout flex h-9 items-center gap-2.5 rounded-md border-0 bg-transparent text-[14px]! font-medium! text-[var(--text)] transition-colors duration-150 hover:bg-[var(--green-50)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--green-700)] ${isSidebarCollapsed ? 'justify-center px-0' : 'px-2.5'}`}
          >
            <span className="sidebar-nav-icon" aria-hidden="true">
              <LogOut size={20} strokeWidth={SIDEBAR_ICON_STROKE} className="shrink-0" />
            </span>
            {!isSidebarCollapsed ? 'Logout' : null}
          </button>

          <div className="sidebar-account">
            <SidebarUserCard user={user} isCollapsed={isSidebarCollapsed} />
          </div>
        </div>
      </motion.aside>

      {





                                                                                         }
      {!fullBleed ? (
        <Link className="brand mobile-topbar" to={ROLE_DASHBOARDS[user.role]}>
          <span className="brand-mark">
            <img src={logo} alt="" />
          </span>
          <span>
            <strong><BrandWordmark /></strong>
            <small>{user.role} workspace</small>
          </span>
        </Link>
      ) : null}

      {





                                                               }
      <main
        className={`main-content ${pageClassName} ${fullBleed ? 'main-content-full-bleed' : ''} ${!fullBleed && hideHeader ? 'main-content-flush' : ''} ${wide ? 'main-content-wide' : ''}`
          .trim().replace(/\s+/g, ' ')}
      >
        {!fullBleed ? (
          <nav className="app-breadcrumb" aria-label="Breadcrumb">
            <Link to={ROLE_DASHBOARDS[user.role]} className="app-breadcrumb-home">Home</Link>
            <ChevronRight size={13} aria-hidden="true" />
            {breadcrumbParent && breadcrumbParent !== title ? (
              <>
                <Link
                  to={location.state?.checkoutPath || '/marketplace'}
                  className="app-breadcrumb-link"
                >
                  {breadcrumbParent}
                </Link>
                <ChevronRight size={13} aria-hidden="true" />
              </>
            ) : null}
            {breadcrumbParent === title ? (
              <Link
                to="/marketplace"
                className="app-breadcrumb-link"
                aria-current="page"
              >
                {title}
              </Link>
            ) : (
              <span aria-current="page">{title}</span>
            )}
          </nav>
        ) : null}
        {!fullBleed && !hideHeader ? (
          <header className="page-header">
            <div>
              <p className="eyebrow">{eyebrow}</p>
              <h1>{title}</h1>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
            <div className="page-header-actions">
              {headerActions}
              <div className="header-utility-controls" role="group" aria-label="Quick actions">
                {ORDERING_ROLES.includes(user.role) ? <CartButton /> : null}
                <ThemeToggle compact />
                {hasProfile ? <NotificationBell userId={user.id} /> : null}
              </div>
            </div>
          </header>
        ) : null}
        {hasProfile ? <LocationPermissionNotice role={user.role} {...locationAccess} /> : null}
        {locationSharingError ? <div className="form-alert error">{locationSharingError}</div> : null}
        {pickupSharingError ? <div className="form-alert error">{pickupSharingError}</div> : null}
        {children}
      </main>

      <MobileBottomNav user={user} navItems={navItems} />
    </div>
  );
}
