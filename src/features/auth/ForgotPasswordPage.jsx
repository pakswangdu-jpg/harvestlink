import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import BrandWordmark from '../../components/common/BrandWordmark';
import Button from '../../components/common/Button';
import FormAlert from '../../components/common/FormAlert';
import FormField from '../../components/common/FormField';
import { requestPasswordReset } from '../../services/authService';
import { isValidEmail } from '../../utils/validators';
import logo from '../../assets/logo.png';
import './ForgotPasswordPage.css';

function getPasswordRecoveryRedirect() {
  return new URL('/reset-password', window.location.origin).toString();
}

function getResetErrorMessage(error) {
  if (error?.status === 429) {
    return 'Too many reset requests. Please try again later.';
  }
  if (error?.status >= 500) return 'Something went wrong. Please try again later.';
  if ([400, 404, 503].includes(error?.status) && error.message) return error.message;
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  if (message.includes('invalid') && message.includes('email')) {
    return 'Please enter a valid email address.';
  }
  const networkError = error?.name === 'TypeError'
    || ['ECONNABORTED', 'ECONNRESET', 'ENETUNREACH', 'ENOTFOUND', 'ETIMEDOUT'].includes(error?.code)
    || message.includes('network')
    || message.includes('failed to fetch')
    || message.includes('timeout');
  if (networkError) {
    return 'Unable to connect to the server. Please check your internet connection and try again.';
  }
  return "Unable to connect to the server. Please check your internet connection and try again.";
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    if (cooldownSeconds <= 0) return undefined;
    const timer = window.setInterval(() => {
      setCooldownSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  const startCooldown = (emailAddress) => {
    const seconds = 60;
    const cooldownUntil = Date.now() + seconds * 1000;
    try {
      sessionStorage.setItem(`password-reset-cooldown:${emailAddress}`, String(cooldownUntil));
    } catch {
      // The server-side limit still applies if browser storage is unavailable.
    }
    setCooldownSeconds(seconds);
  };

  const restoreCooldown = (emailAddress) => {
    try {
      const cooldownUntil = Number(sessionStorage.getItem(`password-reset-cooldown:${emailAddress}`) || 0);
      setCooldownSeconds(Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)));
    } catch {
      setCooldownSeconds(0);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError('Please enter your email address.');
      return;
    }
    if (!isValidEmail(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await requestPasswordReset(trimmed, getPasswordRecoveryRedirect());
      setSent(true);
      startCooldown(trimmed);
    } catch (requestError) {
      setError(getResetErrorMessage(requestError));
      if (requestError?.status === 429 && requestError.retryAfterSeconds) {
        setCooldownSeconds(Math.max(cooldownSeconds, requestError.retryAfterSeconds));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page auth-page-recovery">
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
          <h1>Reset your password</h1>
          <p>Enter your account email. We will send a link to set a new password.</p>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-card-header">
          <h2>Forgot password</h2>
          <p>We'll email you a secure link to reset it.</p>
        </div>

        {sent ? (
          <div className="form-stack">
            <FormAlert
              type="success"
              title="Reset link sent"
              message={`A password reset link has been sent to ${email.trim()}. Check your inbox and spam folder.`}
            />
            <Button
              type="button"
              className="full-width"
              variant="secondary"
              disabled={cooldownSeconds > 0 || isSubmitting}
              onClick={() => setSent(false)}
            >
              {cooldownSeconds > 0
                ? cooldownSeconds >= 60
                  ? `Send another link in ${Math.ceil(cooldownSeconds / 60)} minute${Math.ceil(cooldownSeconds / 60) === 1 ? '' : 's'}`
                  : `Send another link in ${cooldownSeconds}s`
                : 'Send another link'}
            </Button>
          </div>
        ) : (
          <form className="form-stack" onSubmit={handleSubmit}>
            {error ? <FormAlert type="error" message={error} /> : null}
            <FormField label="Email address" name="email" error={null}>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (error) setError('');
                  restoreCooldown(event.target.value.trim().toLowerCase());
                }}
                placeholder="name@example.com"
                autoComplete="email"
                autoFocus
              />
            </FormField>
            <Button type="submit" className="full-width" disabled={isSubmitting}>
              {isSubmitting ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>
        )}

        <p className="auth-switch">
          Remembered your password? <Link to="/login">Back to sign in</Link>
        </p>
      </section>
    </main>
  );
}
