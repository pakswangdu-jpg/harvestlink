import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from './AuthContext';
import logo from '../../assets/logo.png';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  // 'checking' until we know whether the recovery link actually established a session —
  // Supabase's client parses the link's token from the URL asynchronously on page load, so
  // this can't be known synchronously on first render.
  const [sessionState, setSessionState] = useState('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setSessionState(session ? 'ready' : 'invalid');
    });
    // Covers the case where the session isn't parsed from the URL until just after this
    // effect's initial getSession() call resolves.
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY' || session) setSessionState('ready');
    });
    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

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
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setIsSubmitting(false);
      setError(updateError.message);
      return;
    }

    // The recovery link's session is now a normal authenticated session for this account —
    // hydrate it into AuthContext and send them straight to their dashboard instead of
    // making them log in again with the password they just set.
    await refreshUser();
    navigate('/login', { replace: true });
  };

  return (
    <main className="auth-page">
      <section className="auth-hero">
        <Link to="/" className="brand auth-brand">
          <span className="brand-mark">
            <img src={logo} alt="" />
          </span>
          <span>
            <strong>HarvestLink</strong>
            <small>Cebu farm-to-market</small>
          </span>
        </Link>
        <div>
          <p className="eyebrow">Prototype access</p>
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
              This reset link is invalid or has expired. Request a new one to continue.
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
