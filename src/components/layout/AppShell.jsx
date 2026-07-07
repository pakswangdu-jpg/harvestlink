import { Link, NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import Button from '../common/Button';
import { ROLE_DASHBOARDS } from '../../utils/constants';
import { getInitials } from '../../utils/formatters';
import { useAuth } from '../../features/auth/AuthContext';
import logo from '../../assets/logo.png';

export default function AppShell({ user, navItems, title, subtitle, children }) {
  const { logout } = useAuth();
  const hasProfile = ['farmer', 'buyer', 'stakeholder'].includes(user.role);

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
      <aside className="sidebar">
        <Link className="brand" to={ROLE_DASHBOARDS[user.role]}>
          <span className="brand-mark">
            <img src={logo} alt="" />
          </span>
          <span>
            <strong>HarvestLink</strong>
            <small>{user.role} workspace</small>
          </span>
        </Link>

        <nav className="side-nav">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {hasProfile ? (
          <Link className="sidebar-user" to="/profile">
            <span className="sidebar-user-avatar">{getInitials(user.name)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
          </Link>
        ) : (
          <div className="sidebar-user">
            <span className="sidebar-user-avatar">{getInitials(user.name)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
          </div>
        )}

        <button className="logout-link" type="button" onClick={handleLogout}>
          <LogOut size={18} />
          Logout
        </button>
      </aside>

      <main className="main-content">
        <header className="page-header">
          <div>
            <p className="eyebrow">Cebu farm-to-market</p>
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
        </header>
        {children}
      </main>

      <nav className="mobile-bottom-nav">
        <div className="mobile-bottom-nav-scroll">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut size={16} />
        </Button>
      </nav>
    </div>
  );
}
