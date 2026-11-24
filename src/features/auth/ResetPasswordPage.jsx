import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BrandWordmark from '../../components/common/BrandWordmark';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import PasswordInput from '../../components/common/PasswordInput';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from './AuthContext';
import logo from '../../assets/logo.png';

const PASSWORD_REQUIREMENTS = [
  { label: 'At least 8 characters', test: (value) => value.length >= 8 },
  { label: 'One uppercase letter (A–Z)', test: (value) => /[A-Z]/.test(value) },
  { label: 'One lowercase letter (a–z)', test: (value) => /[a-z]/.test(value) },
  { label: 'One number (0–9)', test: (value) => /[0-9]/.test(value) },
  { label: 'One special character (!@#$%^&*)', test: (value) => /[!@#$%^&*]/.test(value) },
];

const PASSWORD_STRENGTH_TIERS = [
  { minMet: 0, key: 'weak', label: 'Weak password' },
  { minMet: 3, key: 'medium', label: 'Medium password' },
  { minMet: 5, key: 'strong', label: 'Strong password' },
];

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();



  const [sessionState, setSessionState] = useState('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linkSecondsRemaining, setLinkSecondsRemaining] = useState(0);
  const [recoveryToken] = useState(() => {
    const queryToken = new URLSearchParams(window.location.search).get('token_hash');
    if (queryToken) return queryToken;
    return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token_hash');
  });
  const recoveryRequestRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (recoveryToken) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('token_hash');
      cleanUrl.searchParams.delete('type');
      cleanUrl.hash = '';
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
        setLinkSecondsRemaining(10 * 60);
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

  useEffect(() => {
    if (sessionState !== 'ready') return undefined;
    const timer = window.setInterval(() => {
      setLinkSecondsRemaining((seconds) => {
        if (seconds <= 1) {
          window.clearInterval(timer);
          supabase.auth.signOut({ scope: 'local' });
          setError('This reset link has expired. Request a new one to continue.');
          setSessionState('invalid');
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sessionState]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!password) {
      setError('Enter your password.');
      return;
    }
    if (!PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(password))) {
      setError('Password must meet all requirements.');
      return;
    }
    if (!confirmPassword) {
      setError('Confirm your password.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.user?.id) {
        throw new Error('This reset link is no longer active. Please request a new reset link.');
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      try {
        await refreshUser();
      } catch (refreshError) {
        console.warn('Password changed, but the local profile could not refresh:', refreshError);
      }
      await supabase.auth.signOut({ scope: 'local' });
      navigate('/login', { replace: true });
    } catch (updateError) {
      setIsSubmitting(false);
      setError(updateError.message || 'Unable to update the password. Please request a new reset link and try again.');
    }
  };

  return (
    <main className="auth-page auth-page-reset">
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
          <h1>Set a new password</h1>
          <p>Enter and confirm your new password.</p>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-card-header">
          <h2>Reset password</h2>
          <p>
            {sessionState === 'ready' && linkSecondsRemaining > 0
              ? `This link expires in ${Math.ceil(linkSecondsRemaining / 60)} minute${Math.ceil(linkSecondsRemaining / 60) === 1 ? '' : 's'} and can only be used once.`
              : 'This link expires 10 minutes after it is sent and can only be used once.'}
          </p>
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
              <PasswordInput
                id="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter new password"
              />
              <ul className="reset-password-requirements" aria-label="Password requirements">
                {PASSWORD_REQUIREMENTS.map((requirement) => (
                  <li key={requirement.label} className={requirement.test(password) ? 'met' : ''}>
                    {requirement.test(password) ? '✓' : '○'} {requirement.label}
                  </li>
                ))}
              </ul>
              <p className={`password-strength-indicator ${[...PASSWORD_STRENGTH_TIERS].reverse().find((tier) => PASSWORD_REQUIREMENTS.filter((requirement) => requirement.test(password)).length >= tier.minMet).key}`}>
                {[...PASSWORD_STRENGTH_TIERS].reverse().find((tier) => PASSWORD_REQUIREMENTS.filter((requirement) => requirement.test(password)).length >= tier.minMet).label}
              </p>
            </FormField>
            <FormField label="Confirm new password" name="confirmPassword" error={null}>
              <PasswordInput
                id="confirmPassword"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter new password"
              />
              {confirmPassword && password !== confirmPassword ? (
                <p className="field-error" role="alert">Passwords do not match.</p>
              ) : null}
            </FormField>
            <Button type="submit" className="full-width" disabled={isSubmitting}>
              {isSubmitting ? 'Updating…' : 'Update password'}
            </Button>
          </form>
        )}

        <p className="auth-switch">
          <Link to="/login">Back to sign in</Link>
        </p>
      </section>
    </main>
  );
}
