import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import { supabase } from '../../lib/supabaseClient';
import logo from '../../assets/logo.png';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError('Enter your email address.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setIsSubmitting(false);
    // Always show the same success state regardless of whether the email actually exists —
    // confirming/denying an email's existence here would let anyone probe which addresses
    // are registered.
    if (resetError && resetError.status !== 400) {
      setError(resetError.message);
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
            <strong>HarvestLink</strong>
            <small>Cebu farm-to-market</small>
          </span>
        </Link>
        <div>
          <p className="eyebrow">Prototype access</p>
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
          <div className="form-alert success">
            If an account exists for {email.trim()}, a password reset link is on its way — check your inbox
            (and spam folder). The link expires after a while, so use it soon.
          </div>
        ) : (
          <form className="form-stack" onSubmit={handleSubmit}>
            {error ? <div className="form-alert error">{error}</div> : null}
            <FormField label="Email address" name="email" error={null}>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
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
