import { useState } from 'react';
import { Link } from 'react-router-dom';
import BrandWordmark from '../../components/common/BrandWordmark';
import Button from '../../components/common/Button';
import FormAlert from '../../components/common/FormAlert';
import FormField from '../../components/common/FormField';
import { supabase } from '../../lib/supabaseClient';
import { isValidEmail } from '../../utils/validators';
import logo from '../../assets/logo.png';

function getPasswordRecoveryRedirect() {
  const url = new URL('/reset-password', window.location.origin);
  // Supabase redirect allowlists commonly include localhost, while Vite may be opened
  // through its equivalent loopback hostname.
  if (url.hostname === '127.0.0.1') url.hostname = 'localhost';
  return url.toString();
}

function getResetErrorMessage(error) {
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  if (message.includes('invalid') && message.includes('email')) {
    return 'Please enter a valid email address.';
  }
  if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
    return 'Something went wrong while sending the reset link. Please try again.';
  }
  return "We couldn't send the reset link. Please check the email address and try again.";
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
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
    let resetError;
    try {
      ({ error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: getPasswordRecoveryRedirect(),
      }));
    } catch (requestError) {
      setIsSubmitting(false);
      setError(getResetErrorMessage(requestError));
      return;
    }
    setIsSubmitting(false);
    // Always show the same success state regardless of whether the email actually exists —
    // confirming/denying an email's existence here would let anyone probe which addresses
    // are registered.
    if (resetError) {
      setError(getResetErrorMessage(resetError));
      return;
    }
    setSent(true);
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
          <h1>Reset your password.</h1>
          <p>Enter the email address on your account and we'll send you a link to set a new password.</p>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-card-header">
          <h2>Forgot password</h2>
          <p>We'll email you a secure link to reset it.</p>
        </div>

        {sent ? (
          <FormAlert
            type="success"
            title="Reset link sent"
            message={`If an account exists for ${email.trim()}, you'll receive a password reset link shortly. Check your inbox and spam folder.`}
          />
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
          Remembered your password? <Link to="/login">Back to login</Link>
        </p>
      </section>
    </main>
  );
}
