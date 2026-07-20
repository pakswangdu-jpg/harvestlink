import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, Lock, LocateFixed, Mail, Sparkles } from 'lucide-react';
import { useState } from 'react';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import { CEBU_MUNICIPALITIES, ORGANIZATION_TYPES, ROLE_DASHBOARDS } from '../../utils/constants';
import { findNearestMunicipality } from '../../utils/geo';
import { reverseGeocode } from '../../services/geocodeService';
import { hasErrors, validateAuthForm } from '../../utils/validators';
import { useAuth } from './AuthContext';
import logo from '../../assets/logo.png';

const VALID_ROLES = ['farmer', 'buyer', 'stakeholder'];

// Convenience only — re-fills the email field on a later visit, never the session itself.
// Kept separate from the real login() call so "Do the login logic" stays untouched.
const REMEMBERED_EMAIL_KEY = 'harvestlink:rememberedEmail';

const LOGIN_FEATURE_BADGES = ['AI Price Recommendation', 'Secure Payments', 'Real-Time Delivery Tracking', 'Surplus Donation Program'];

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.87 2.69-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.96 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

function buildEmptyForm(preselectedRole) {
  return {
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: VALID_ROLES.includes(preselectedRole) ? preselectedRole : 'farmer',
    organizationName: '',
    organizationType: ORGANIZATION_TYPES[0],
    contactPerson: '',
    municipality: CEBU_MUNICIPALITIES[0],
    address: '',
    zipCode: '',
    accreditationFile: '',
    birthday: '',
    farmName: '',
    contactNumber: '',
    govIdFile: '',
  };
}

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { currentUser, loading: authLoading, login, register } = useAuth();
  const [form, setForm] = useState(() => {
    const base = buildEmptyForm(searchParams.get('role'));
    const rememberedEmail = !isRegister && localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (rememberedEmail) base.email = rememberedEmail;
    return base;
  });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState('');
  const [rememberMe, setRememberMe] = useState(() => !isRegister && Boolean(localStorage.getItem(REMEMBERED_EMAIL_KEY)));
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [googleNotice, setGoogleNotice] = useState('');

  if (!authLoading && currentUser) return <Navigate to={ROLE_DASHBOARDS[currentUser.role]} replace />;

  const updateField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => {
      const next = { ...previous, [field]: undefined, form: undefined };
      // A stale "passwords don't match" error on the other field would otherwise
      // linger until that field is blurred again.
      if (field === 'password' || field === 'confirmPassword') next.confirmPassword = undefined;
      return next;
    });
    setMessage('');
  };

  // Validates a single field as soon as the user leaves it, so a missing/invalid
  // field is flagged immediately instead of only surfacing on submit.
  const handleBlur = (field) => {
    if (!isRegister && field !== 'email' && field !== 'password') return;
    const nextErrors = validateAuthForm(form, mode);
    setErrors((previous) => ({ ...previous, [field]: nextErrors[field] }));
  };

  // The actual upload happens later, in handleSubmit (via authService.registerUser) —
  // Storage's bucket policy requires an authenticated session to write into a user's own
  // folder, and there's no session yet while the form is still being filled in. This just
  // holds onto the picked File until then.
  const handleFileChange = (field) => (event) => {
    const file = event.target.files?.[0];
    if (file) updateField(field, file);
  };

  // Uses the browser's Geolocation API to auto-fill municipality, street address, and zip
  // code — nice-to-have for a mobile-first registration flow where typing a full address is
  // tedious. Municipality is matched by real distance (findNearestMunicipality), not by
  // trusting OSM's admin-boundary text, so it always resolves to one of our known list.
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationNotice('Location access is not supported on this device.');
      return;
    }
    setIsLocating(true);
    setLocationNotice('');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        updateField('municipality', findNearestMunicipality(latitude, longitude));
        const reverse = await reverseGeocode({ lat: latitude, lng: longitude });
        setIsLocating(false);
        if (reverse?.address) {
          updateField('address', reverse.address);
          if (reverse.zipCode) updateField('zipCode', reverse.zipCode);
          setLocationNotice('Location detected — please double-check the details below.');
        } else {
          setLocationNotice('Location detected, but we could not fill in your street address automatically — please enter it manually.');
        }
      },
      (error) => {
        setIsLocating(false);
        setLocationNotice(
          error.code === error.PERMISSION_DENIED
            ? 'Location access was denied. You can still fill this in manually.'
            : 'Unable to detect your location. Please fill this in manually.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validateAuthForm(form, mode);
    if (hasErrors(nextErrors)) {
      setErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const user = isRegister ? await register(form) : await login(form.email, form.password);
      if (!isRegister) {
        if (rememberMe) localStorage.setItem(REMEMBERED_EMAIL_KEY, form.email.trim().toLowerCase());
        else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }
      const fallback = ROLE_DASHBOARDS[user.role];
      navigate(location.state?.from || fallback, { replace: true });
    } catch (error) {
      setErrors({ form: error.message });
      setMessage('');
      setIsSubmitting(false);
    }
  };

  // No Google OAuth provider is configured on this Supabase project yet — clicking shows an
  // honest inline notice instead of silently doing nothing or faking a working sign-in.
  const handleGoogleClick = () => setGoogleNotice("Google sign-in isn't available yet — please use your email and password.");

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

        {isRegister ? (
          <div className="auth-hero-decor">
            <p className="eyebrow">Prototype access</p>
            <h1>Create your trading account.</h1>
            <p>
              Farmers manage produce, orders, and surplus donations. Buyers browse harvests, check out with
              payment and delivery tracking. Partner organizations (orphanages, elder-care homes, NGOs, food
              banks) can request surplus produce donations.
            </p>
          </div>
        ) : (
          <div className="auth-hero-decor">
            <span className="lp-badge"><Sparkles size={14} /> AI-Assisted Agricultural Marketplace</span>
            <h1>Welcome back to HarvestLink</h1>
            <p>
              Manage products, monitor orders, track deliveries, receive AI-powered pricing recommendations,
              and connect directly with buyers across Cebu.
            </p>
            <ul className="lp-trust-list auth-hero-features">
              {LOGIN_FEATURE_BADGES.map((item) => (
                <li key={item}><CheckCircle2 size={16} /> {item}</li>
              ))}
            </ul>
          </div>
        )}

        {!isRegister ? (
          <div className="auth-hero-preview">
            <span className="category-pill">Vegetables</span>
            <strong>Fresh Cabbage</strong>
            <span className="auth-hero-preview-price">₱55.00/kg <em>AI recommended</em></span>
          </div>
        ) : null}
      </section>

      <section className="auth-card">
        <div className="auth-card-header">
          <h2>{isRegister ? 'Register' : 'Welcome Back'}</h2>
          <p>{isRegister ? 'Choose your role and start trading locally.' : 'Sign in to continue to your HarvestLink account.'}</p>
        </div>

        <form className="form-stack" onSubmit={handleSubmit}>
          {errors.form ? <div className="form-alert error">{errors.form}</div> : null}
          {message ? <div className="form-alert success">{message}</div> : null}

          {isRegister ? (
            <>
              <FormField label="Account type" name="role" error={errors.role}>
                <select id="role" value={form.role} onChange={(event) => updateField('role', event.target.value)}>
                  <option value="farmer">Farmer</option>
                  <option value="buyer">Buyer</option>
                  <option value="stakeholder">Partner organization (donation recipient)</option>
                </select>
              </FormField>
              <div className="form-grid three">
                <FormField label="First name" name="firstName" error={errors.firstName}>
                  <input
                    id="firstName"
                    value={form.firstName}
                    onChange={(event) => updateField('firstName', event.target.value)}
                    onBlur={() => handleBlur('firstName')}
                    placeholder="Juan"
                  />
                </FormField>
                <FormField label="Middle name" name="middleName" error={errors.middleName} helper="Optional">
                  <input
                    id="middleName"
                    value={form.middleName}
                    onChange={(event) => updateField('middleName', event.target.value)}
                    placeholder="Santos"
                  />
                </FormField>
                <FormField label="Last name" name="lastName" error={errors.lastName}>
                  <input
                    id="lastName"
                    value={form.lastName}
                    onChange={(event) => updateField('lastName', event.target.value)}
                    onBlur={() => handleBlur('lastName')}
                    placeholder="Dela Cruz"
                  />
                </FormField>
              </div>
            </>
          ) : null}

          {isRegister && form.role === 'stakeholder' ? (
            <>
              <FormField label="Organization name" name="organizationName" error={errors.organizationName}>
                <input
                  id="organizationName"
                  value={form.organizationName}
                  onChange={(event) => updateField('organizationName', event.target.value)}
                  onBlur={() => handleBlur('organizationName')}
                  placeholder="Cebu Children's Home"
                />
              </FormField>
              <div className="form-grid">
                <FormField label="Organization type" name="organizationType" error={errors.organizationType}>
                  <select
                    id="organizationType"
                    value={form.organizationType}
                    onChange={(event) => updateField('organizationType', event.target.value)}
                    onBlur={() => handleBlur('organizationType')}
                  >
                    {ORGANIZATION_TYPES.map((type) => <option key={type}>{type}</option>)}
                  </select>
                </FormField>
                <FormField label="Municipality" name="municipality" error={errors.municipality}>
                  <select
                    id="municipality"
                    value={form.municipality}
                    onChange={(event) => updateField('municipality', event.target.value)}
                    onBlur={() => handleBlur('municipality')}
                  >
                    {CEBU_MUNICIPALITIES.map((municipality) => <option key={municipality}>{municipality}</option>)}
                  </select>
                </FormField>
              </div>
              <FormField label="Contact person" name="contactPerson" error={errors.contactPerson}>
                <input
                  id="contactPerson"
                  value={form.contactPerson}
                  onChange={(event) => updateField('contactPerson', event.target.value)}
                  onBlur={() => handleBlur('contactPerson')}
                  placeholder="Program coordinator's name"
                />
              </FormField>
              <FormField label="Contact number" name="contactNumber" error={errors.contactNumber}>
                <input
                  id="contactNumber"
                  type="tel"
                  value={form.contactNumber}
                  onChange={(event) => updateField('contactNumber', event.target.value)}
                  onBlur={() => handleBlur('contactNumber')}
                  placeholder="09XX XXX XXXX"
                />
              </FormField>
              <FormField label="Proof of accreditation" name="accreditationFile" helper="Optional. Uploaded securely — only visible to admins for verification.">
                <input id="accreditationFile" type="file" accept="image/*,.pdf" onChange={handleFileChange('accreditationFile')} />
              </FormField>
            </>
          ) : null}

          {isRegister && form.role === 'farmer' ? (
            <>
              <div className="form-grid">
                <FormField label="Birthday" name="birthday" error={errors.birthday}>
                  <input
                    id="birthday"
                    type="date"
                    value={form.birthday}
                    onChange={(event) => updateField('birthday', event.target.value)}
                    onBlur={() => handleBlur('birthday')}
                  />
                </FormField>
                <FormField label="Contact number" name="contactNumber" error={errors.contactNumber}>
                  <input
                    id="contactNumber"
                    type="tel"
                    value={form.contactNumber}
                    onChange={(event) => updateField('contactNumber', event.target.value)}
                    onBlur={() => handleBlur('contactNumber')}
                    placeholder="09XX XXX XXXX"
                  />
                </FormField>
              </div>
              <div className="form-grid">
                <FormField label="Farm name" name="farmName" error={errors.farmName}>
                  <input
                    id="farmName"
                    value={form.farmName}
                    onChange={(event) => updateField('farmName', event.target.value)}
                    onBlur={() => handleBlur('farmName')}
                    placeholder="Dela Cruz Family Farm"
                  />
                </FormField>
                <FormField label="Farm location" name="municipality" error={errors.municipality}>
                  <select
                    id="municipality"
                    value={form.municipality}
                    onChange={(event) => updateField('municipality', event.target.value)}
                    onBlur={() => handleBlur('municipality')}
                  >
                    {CEBU_MUNICIPALITIES.map((municipality) => <option key={municipality}>{municipality}</option>)}
                  </select>
                </FormField>
              </div>
              <FormField label="Proof of certification / government ID" name="govIdFile" helper="Optional. Uploaded securely — only visible to admins for verification.">
                <input id="govIdFile" type="file" accept="image/*,.pdf" onChange={handleFileChange('govIdFile')} />
              </FormField>
            </>
          ) : null}

          {isRegister && form.role === 'buyer' ? (
            <div className="form-grid">
              <FormField label="Contact number" name="contactNumber" error={errors.contactNumber}>
                <input
                  id="contactNumber"
                  type="tel"
                  value={form.contactNumber}
                  onChange={(event) => updateField('contactNumber', event.target.value)}
                  onBlur={() => handleBlur('contactNumber')}
                  placeholder="09XX XXX XXXX"
                />
              </FormField>
              <FormField label="Location" name="municipality" error={errors.municipality}>
                <select
                  id="municipality"
                  value={form.municipality}
                  onChange={(event) => updateField('municipality', event.target.value)}
                  onBlur={() => handleBlur('municipality')}
                >
                  {CEBU_MUNICIPALITIES.map((municipality) => <option key={municipality}>{municipality}</option>)}
                </select>
              </FormField>
            </div>
          ) : null}

          {isRegister && ['farmer', 'buyer', 'stakeholder'].includes(form.role) ? (
            <>
              <div>
                <Button type="button" variant="secondary" size="sm" onClick={handleUseMyLocation} disabled={isLocating}>
                  <LocateFixed size={15} /> {isLocating ? 'Locating…' : 'Use my current location'}
                </Button>
                {locationNotice ? <p className="muted">{locationNotice}</p> : null}
              </div>
              <div className="form-grid">
                <FormField label="Complete address" name="address" error={errors.address}>
                  <input
                    id="address"
                    value={form.address}
                    onChange={(event) => updateField('address', event.target.value)}
                    onBlur={() => handleBlur('address')}
                    placeholder="House/Unit No., Street, Barangay"
                  />
                </FormField>
                <FormField label="Zip code" name="zipCode" error={errors.zipCode}>
                  <input
                    id="zipCode"
                    value={form.zipCode}
                    onChange={(event) => updateField('zipCode', event.target.value)}
                    onBlur={() => handleBlur('zipCode')}
                    placeholder="6000"
                    inputMode="numeric"
                    maxLength={4}
                  />
                </FormField>
              </div>
            </>
          ) : null}

          <FormField label="Email address" name="email" error={errors.email}>
            <div className="input-icon-field">
              <Mail size={17} aria-hidden="true" />
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(event) => updateField('email', event.target.value)}
                onBlur={() => handleBlur('email')}
                placeholder="name@example.com"
                autoComplete="email"
              />
            </div>
          </FormField>
          <FormField label="Password" name="password" error={errors.password}>
            <div className="input-icon-field has-toggle">
              <Lock size={17} aria-hidden="true" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(event) => updateField('password', event.target.value)}
                onBlur={() => handleBlur('password')}
                placeholder="Enter password"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
              />
              <button
                type="button"
                className="input-icon-toggle"
                onClick={() => setShowPassword((previous) => !previous)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </FormField>

          {!isRegister ? (
            <div className="auth-remember-row">
              <label className="auth-checkbox">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                />
                <span>Remember me</span>
              </label>
              <Link className="auth-forgot-link" to="/forgot-password">Forgot password?</Link>
            </div>
          ) : null}

          {isRegister ? (
            <FormField label="Confirm password" name="confirmPassword" error={errors.confirmPassword}>
              <div className="input-icon-field has-toggle">
                <Lock size={17} aria-hidden="true" />
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={form.confirmPassword}
                  onChange={(event) => updateField('confirmPassword', event.target.value)}
                  onBlur={() => handleBlur('confirmPassword')}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="input-icon-toggle"
                  onClick={() => setShowConfirmPassword((previous) => !previous)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </FormField>
          ) : null}

          <Button type="submit" size="lg" className="full-width" disabled={isSubmitting}>
            {isSubmitting
              ? (isRegister ? 'Creating account…' : 'Signing in…')
              : (isRegister ? 'Create account' : 'Sign in')}
          </Button>

          {!isRegister ? (
            <>
              <div className="auth-divider"><span>or continue with</span></div>
              <button type="button" className="btn btn-google btn-lg full-width" onClick={handleGoogleClick}>
                <GoogleMark /> Continue with Google
              </button>
              {googleNotice ? <div className="form-alert info">{googleNotice}</div> : null}
            </>
          ) : null}
        </form>

        <p className="auth-switch">
          {isRegister ? 'Already have an account?' : 'New to HarvestLink?'}{' '}
          <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Login' : 'Register'}</Link>
        </p>
      </section>
    </main>
  );
}
