import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BrandWordmark from '../../components/common/BrandWordmark';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from './AuthContext';
import logo from '../../assets/logo.png';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();



  const [sessionState, setSessionState] = useState('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recoveryToken] = useState(() => new URLSearchParams(window.location.search).get('token_hash'));
  const recoveryRequestRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (recoveryToken) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('token_hash');
      cleanUrl.searchParams.delete('type');
      window.history.replaceState(window.history.state, '', cleanUrl.toString());
      // Reuse the request when StrictMode replays this effect; recovery tokens are single-use.
      if (!recoveryRequestRef.current) {
        recoveryRequestRef.current = supabase.auth.verifyOtp({ token_hash: recoveryToken, type: 'recovery' });
      }
      recoveryRequestRef.current.then(({ data, error: recoveryError }) => {
        if (cancelled) return;
        if (recoveryError || !data?.session?.user?.id) {
          setError('This reset link is invalid or has expired. Request a new one to continue.');
          setSessionState('invalid');
          return;
        }
        setSessionState('ready');
      }).catch(() => {
        if (cancelled) return;
        setError('Unable to verify this reset link. Please request a new one and try again.');
        setSessionState('invalid');
      });
      return () => { cancelled = true; };
    }
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY' && session?.user?.id) setSessionState('ready');
    });

    supabase.auth.getSession()
      .then(() => {
        if (!cancelled) setSessionState((current) => (current === 'ready' ? current : 'invalid'));
      })
      .catch((sessionError) => {
        if (cancelled) return;
        console.error('Unable to verify the password recovery session:', sessionError);
        setError('Unable to verify this reset link. Please request a new one and try again.');
        setSessionState('invalid');
      });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [recoveryToken]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      await refreshUser();
      navigate('/login', { replace: true });
    } catch (updateError) {
      setIsSubmitting(false);
      setError(updateError.message || 'Unable to update the password. Please request a new reset link and try again.');
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-hero">
        <Link to="/" className="brand auth-brand">
          <span className="brand-mark">
            <img src={logo} alt="" />
          </span>
          <span>
            <strong><BrandWordmark /></strong>
            <small>Cebu farm-to-market</small>
          </span>
        </Link>
        <div>
          <h1>Set a new password.</h1>
          <p>Choose a new password for your account.</p>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-card-header">
          <h2>Reset password</h2>
          <p>This link can only be used once.</p>
        </div>

        {sessionState === 'checking' ? (
          <p className="muted">Verifying your reset link…</p>
        ) : sessionState === 'invalid' ? (
          <>
            <div className="form-alert error">
              {error || 'This reset link is invalid or has expired. Request a new one to continue.'}
            </div>
            <Link className="btn btn-primary btn-md full-width" to="/forgot-password">Request a new link</Link>
          </>
        ) : (
          <form className="form-stack" onSubmit={handleSubmit}>
            {error ? <div className="form-alert error">{error}</div> : null}
            <FormField label="New password" name="password" error={null}>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter new password"
                autoFocus
              />
            </FormField>
            <FormField label="Confirm new password" name="confirmPassword" error={null}>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter new password"
              />
            </FormField>
            <Button type="submit" className="full-width" disabled={isSubmitting}>
              {isSubmitting ? 'Updating…' : 'Update password'}
            </Button>
          </form>
        )}

        <p className="auth-switch">
          <Link to="/login">Back to login</Link>
        </p>
      </section>
    </main>
  );
}
