import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import Button from '../common/Button';
import { SIDEBAR_ICON_STROKE } from './SidebarNavItem';
import { useAuth } from '../../features/auth/AuthContext';
import { useNavItemsWithBadges } from '../../hooks/useNavItemsWithBadges';
import NotificationBadge from '../common/NotificationBadge';

// The mobile-only bottom nav strip (see .mobile-bottom-nav in globals.css), normally rendered
// by AppShell — pulled out here so full-page flows that deliberately skip AppShell
// (GcashPaymentPage, ConfirmGcashPaymentPage, CodPaymentPage — see their own "why no
// AppShell" comments) can still give a mobile buyer a way back into the app instead of being
// stranded with only an in-page "Back" link.
export default function MobileBottomNav({ user, navItems }) {
  const { logout } = useAuth();
  const navItemsWithBadges = useNavItemsWithBadges(user, navItems);

  // Every page renders its own instance, so this — including the horizontally-scrollable
  // strip — unmounts and remounts on every navigation, which resets its scroll position back
  // to the start. Without this, tapping an item near the end of the strip would navigate
  // there and then immediately "snap back" to showing the first few icons instead of staying
  // put on the one just tapped. Instant (not smooth) on purpose — this should look like it
  // was already positioned there, not visibly scroll on load.
  const scrollRef = useRef(null);
  useEffect(() => {
    scrollRef.current?.querySelector('a.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, []);

  const handleLogout = () => {
    // Same reasoning as AppShell's own handleLogout — a full navigation instead of
    // client-side navigate() sidesteps a race with ProtectedRoute's own redirect.
    logout();
    window.location.href = '/';
  };

  return (
    <nav className="mobile-bottom-nav">
      <div className="mobile-bottom-nav-scroll" ref={scrollRef}>
        {navItemsWithBadges.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            aria-label={item.badge > 0 ? `${item.label}, ${item.badge > 9 ? '9 or more' : item.badge} items needing attention` : item.label}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            <item.icon size={20} strokeWidth={SIDEBAR_ICON_STROKE} />
            <span>{item.label}</span>
            <NotificationBadge count={item.badge} />
          </NavLink>
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={handleLogout}>
        <LogOut size={20} strokeWidth={SIDEBAR_ICON_STROKE} />
      </Button>
    </nav>
  );
}
