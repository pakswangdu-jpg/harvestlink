import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ROLE_DASHBOARDS } from '../../utils/constants';

export default function ProtectedRoute({ allowedRoles }) {
  const { currentUser, loading } = useAuth();
  const location = useLocation();





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
