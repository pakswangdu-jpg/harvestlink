import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ROLE_DASHBOARDS } from '../../utils/constants';

export default function ProtectedRoute({ allowedRoles }) {
  const { currentUser } = useAuth();
  const location = useLocation();

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (!allowedRoles.includes(currentUser.role)) {
    return <Navigate to={ROLE_DASHBOARDS[currentUser.role] || '/'} replace />;
  }

  return <Outlet />;
}
