import { useId, useLayoutEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import Button from '../common/Button';
import { useLogout } from '../../hooks/useLogout';
import { useNavItemsWithBadges } from '../../hooks/useNavItemsWithBadges';
import NotificationBadge from '../common/NotificationBadge';

export default function MobileBottomNav({ user, navItems }) {
  const { handleLogout, isLoggingOut } = useLogout();
  const { pathname } = useLocation();
  const navItemsWithBadges = useNavItemsWithBadges(user, navItems);
  const navRef = useRef(null);
  const scrollRef = useRef(null);
  const previousPath = useRef(null);
  const scrollHintId = useId();

  const revealItem = (item, behavior = 'auto') => {
    const scroller = scrollRef.current;
    if (!item || !scroller?.clientWidth) return;
    const viewport = scroller.getBoundingClientRect();
    const target = item.getBoundingClientRect();
    const delta = target.left < viewport.left + 4
      ? target.left - viewport.left - 4
      : target.right > viewport.right - 4 ? target.right - viewport.right + 4 : 0;
    if (delta) scroller.scrollTo({ left: scroller.scrollLeft + delta, behavior });
  };

  useLayoutEffect(() => {
    const nav = navRef.current;
    const scroller = scrollRef.current;
    const shell = nav.closest('.app-shell, .gcash-payment-page');
    let previousWidth = scroller.clientWidth;

    const updateScrollHints = () => {
      nav.dataset.scrollStart = String(scroller.scrollLeft > 1);
      nav.dataset.scrollEnd = String(scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1);
    };

    const measure = () => {
      // The measured height already includes env(safe-area-inset-bottom).
      shell?.style.setProperty('--bottom-nav-height', `${nav.getBoundingClientRect().height}px`);
      if (previousWidth !== scroller.clientWidth) {
        previousWidth = scroller.clientWidth;
        revealItem(scroller.querySelector('[aria-current="page"]'));
      }
      updateScrollHints();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav, { box: 'border-box' });
    observer.observe(scroller);
    scroller.addEventListener('scroll', updateScrollHints, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener('scroll', updateScrollHints);
      shell?.style.removeProperty('--bottom-nav-height');
    };
  }, []);

  useLayoutEffect(() => {
    const behavior = previousPath.current !== null && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'smooth' : 'auto';
    revealItem(scrollRef.current?.querySelector('[aria-current="page"]'), behavior);
    previousPath.current = pathname;
  }, [pathname, navItems.length]);

  return (
    <nav className="mobile-bottom-nav" aria-label="Main navigation" aria-describedby={scrollHintId} ref={navRef}>
      <span id={scrollHintId} className="sr-only">Swipe left or right to see all navigation items, or use Tab on a keyboard.</span>
      <span className="mobile-bottom-nav-edge mobile-bottom-nav-edge-start" aria-hidden="true"><ChevronLeft size={12} /></span>
      <div className="mobile-bottom-nav-scroll" ref={scrollRef} onFocusCapture={(event) => revealItem(event.target.closest('a, button'))}>
        {navItemsWithBadges.map((item) => {
          const Icon = item.bottomIcon || item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              aria-label={item.badge > 0 ? `${item.label}, ${item.badge > 9 ? '9 or more' : item.badge} items needing attention` : item.label}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <span className="mobile-bottom-nav-icon-row">
                <Icon size={22} strokeWidth={2.5} aria-hidden="true" />
                <NotificationBadge count={item.badge} />
              </span>
              <span className="mobile-bottom-nav-label">{item.label}</span>
            </NavLink>
          );
        })}
        <Button variant="ghost" size="sm" onClick={handleLogout} disabled={isLoggingOut} aria-busy={isLoggingOut} aria-label="Logout">
          <span className="mobile-bottom-nav-icon-row">
            <LogOut size={22} strokeWidth={2.5} aria-hidden="true" />
          </span>
          <span className="mobile-bottom-nav-label">Logout</span>
        </Button>
      </div>
      <span className="mobile-bottom-nav-edge mobile-bottom-nav-edge-end" aria-hidden="true"><ChevronRight size={12} /></span>
    </nav>
  );
}
