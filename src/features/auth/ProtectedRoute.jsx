import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ROLE_DASHBOARDS } from '../../utils/constants';

export default function ProtectedRoute({ allowedRoles }) {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  // Session restore is async now (a real request to Supabase + our API, not a synchronous
  // localStorage read) — render nothing while it's in flight rather than redirecting to
  // /login before it's had a chance to resolve, which would flash-redirect a logged-in
  // user on every hard refresh of a protected route.
  if (loading) {
    return (
      <main
        style={{
          alignItems: 'center',
          background: 'var(--page, #f7f8f5)',
          color: 'var(--ink, #182018)',
          display: 'flex',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '2rem',
        }}
      >
        Restoring your session...
      </main>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (!allowedRoles.includes(currentUser.role)) {
    return <Navigate to={ROLE_DASHBOARDS[currentUser.role] || '/'} replace />;
  }

  return <Outlet />;
}
