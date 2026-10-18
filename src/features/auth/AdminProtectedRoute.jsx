import { useEffect, useState } from 'react';
import { ArrowLeft, CircleX, ShieldAlert } from 'lucide-react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { apiClient } from '../../services/apiClient';
import AuthPage from './AuthPage';
import { ADMIN_ENTRY_PATH } from '../../utils/authDestination';
import { ROLE_DASHBOARDS } from '../../utils/constants';
import './AdminProtectedRoute.css';

function AccessScreen({
  title = 'Access Denied',
  message = "You don't have permission to access this page. Check your account access or return to your dashboard.",
  retry,
  accountDenied = false,
  backTo = '/',
  backLabel = 'Return to dashboard',
  errorCode = accountDenied && !String(title).includes('404') ? 403 : null,
}) {
  const Icon = typeof CircleX !== 'undefined' ? CircleX : ShieldAlert;
  return (
    <main className={`admin-access-screen${accountDenied ? ' admin-account-denied' : ''}`}>
      <div>
        {accountDenied ? (
          <div className="admin-access-icon-wrap" aria-hidden="true">
            <Icon className="admin-account-denied-icon" size={28} strokeWidth={2} />
          </div>
        ) : null}
        <h1>{title}</h1>
        <div className="admin-access-copy">
          <p role={accountDenied ? 'alert' : 'status'}>{message}</p>
          {errorCode ? <p className="admin-access-error-code">Error code: {errorCode}</p> : null}
        </div>
        <div className="admin-access-actions">
          {retry ? <button type="button" onClick={retry}>Try again</button> : null}
          <Link to={backTo}>
            {accountDenied ? <ArrowLeft size={15} strokeWidth={1.8} aria-hidden="true" /> : null}
            {backLabel}
          </Link>
        </div>
      </div>
    </main>
  );
}

function AdminNetworkGate({ userId, pathname, entry = false }) {
  const key = `${entry ? 'entry' : 'admin'}:${userId || 'signed-out'}:${pathname}`;
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let denied = false;
    let pending = false;
    const check = async () => {
      if (pending || denied) return;
      pending = true;
      setResult(old => old?.key === key && old.status === 'allowed' ? old : { key, status: 'checking' });
      try {
        const response = await apiClient.get(entry ? '/auth/admin-entry-access' : '/auth/admin-access');
        if (!cancelled && !denied) setResult({ key, status: response?.allowed === true ? 'allowed' : 'error' });
      } catch (error) {
        if (!cancelled && !denied) setResult({ key, status: error.status === 403 || error.code === 'ADMIN_NETWORK_NOT_ALLOWED' ? 'denied' : 'error' });
      } finally { pending = false; }
    };
    const restrict = () => { denied = true; setResult({ key, status: 'denied' }); };
    window.addEventListener('harvestlink:admin-network-denied', restrict);
    window.addEventListener('focus', check);
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') check(); }, 30000);
    check();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', check);
      window.removeEventListener('harvestlink:admin-network-denied', restrict);
    };
  }, [key, entry, attempt]);
  const status = result?.key === key ? result.status : 'checking';
  if (status === 'allowed') return entry ? <AuthPage mode="login" adminPortal /> : <Outlet />;
  if (status === 'denied') return <AccessScreen accountDenied title="404 - Page not found" message="The page you requested could not be found." retry={() => setAttempt(value => value + 1)} />;
  if (status === 'error') return <AccessScreen title="Unable to verify Admin access" message="Admin access could not be verified. Please try again." retry={() => setAttempt(value => value + 1)} />;
  return <AccessScreen title="Checking Admin access" message="Verifying your access to the HarvestLink Admin Portal..." />;
}

export default function AdminProtectedRoute() {
  const { currentUser, loading } = useAuth();
  const location = useLocation();
  if (loading) return <AccessScreen title="Checking Admin access" message="Restoring your session..." />;
  if (currentUser && currentUser.role !== 'admin') {
    const dashboard = ROLE_DASHBOARDS[currentUser.role];
    return <AccessScreen accountDenied title="404 - Page not found" message="The page you requested could not be found." backTo={dashboard || '/'} backLabel={dashboard ? 'Back to dashboard' : 'Back to HarvestLink'} />;
  }
  if (!currentUser) return location.pathname === ADMIN_ENTRY_PATH
    ? <AdminNetworkGate userId={null} pathname={location.pathname} entry />
    : <Navigate to={ADMIN_ENTRY_PATH} replace />;
  return <AdminNetworkGate userId={currentUser.id} pathname={location.pathname} />;
}
