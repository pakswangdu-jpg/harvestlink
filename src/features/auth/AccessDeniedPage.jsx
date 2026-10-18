import { Link } from 'react-router-dom';
import { CircleX } from 'lucide-react';
import { useAuth } from './AuthContext';
import { ROLE_DASHBOARDS } from '../../utils/constants';
import './AdminProtectedRoute.css';

export default function AccessDeniedPage({
  title = 'Access Denied',
  message = "You don't have permission to access this page. Check your account access or return to your dashboard.",
  errorCode = 403,
  backTo,
  backLabel,
}) {
  const { currentUser } = useAuth();
  const destination = backTo || (currentUser ? ROLE_DASHBOARDS[currentUser.role] || '/' : '/');
  const actionLabel = backLabel || (currentUser ? 'Return to dashboard' : 'Go back');

  return (
    <main className="admin-access-screen admin-account-denied">
      <div>
        <div className="admin-access-icon-wrap" aria-hidden="true">
          <CircleX className="admin-account-denied-icon" size={28} strokeWidth={2} />
        </div>
        <h1>{title}</h1>
        <div className="admin-access-copy">
          <p role="alert">{message}</p>
          <p className="admin-access-error-code">Error code: {errorCode}</p>
        </div>
        <div className="admin-access-actions">
          <Link to={destination}>{actionLabel}</Link>
        </div>
      </div>
    </main>
  );
}
