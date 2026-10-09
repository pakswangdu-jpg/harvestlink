import { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { apiClient } from '../../services/apiClient';
import AuthPage from './AuthPage';
import { ADMIN_ENTRY_PATH } from '../../utils/authDestination';
import './AdminProtectedRoute.css';

function AccessScreen({ title, message, retry }) {
  return <main className="admin-access-screen"><div>
    <h1>{title}</h1><p role="status">{message}</p>
    <div className="admin-access-actions">{retry ? <button type="button" onClick={retry}>Try again</button> : null}<Link to="/">Back to HarvestLink</Link></div>
  </div></main>;
}

function AdminNetworkGate({ userId, pathname }) {
  const key = `${userId}:${pathname}`;
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
        const response = await apiClient.get('/auth/admin-access');
        if (!cancelled && !denied) setResult({ key, status: response?.allowed === true ? 'allowed' : 'error' });
      } catch (error) {
        if (!cancelled && !denied) setResult({ key, status: error.code === 'ADMIN_NETWORK_NOT_ALLOWED' ? 'denied' : 'error' });
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
  }, [key, attempt]);
  const status = result?.key === key ? result.status : 'checking';
  if (status === 'allowed') return <Outlet />;
  if (status === 'denied') return <AccessScreen title="Admin access restricted" message="You do not have permission to access the HarvestLink Admin Portal." />;
  if (status === 'error') return <AccessScreen title="Unable to verify Admin access" message="Admin access could not be verified. Please try again." retry={() => setAttempt(value => value + 1)} />;
  return <AccessScreen title="Checking Admin access" message="Verifying your access to the HarvestLink Admin Portal..." />;
}

export default function AdminProtectedRoute() {
  const { currentUser, loading } = useAuth();
  const location = useLocation();
  if (loading) return <AccessScreen title="Checking Admin access" message="Restoring your session..." />;
  if (!currentUser) return location.pathname === ADMIN_ENTRY_PATH
    ? <AuthPage mode="login" adminPortal />
    : <Navigate to={ADMIN_ENTRY_PATH} replace />;
  if (currentUser.role !== 'admin') return <AccessScreen title="Admin access restricted" message="You do not have permission to access the HarvestLink Admin Portal." />;
  return <AdminNetworkGate userId={currentUser.id} pathname={location.pathname} />;
}
