import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { LocateFixed } from 'lucide-react';
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
  const [form, setForm] = useState(() => buildEmptyForm(searchParams.get('role')));
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState('');

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
      const fallback = ROLE_DASHBOARDS[user.role];
      navigate(location.state?.from || fallback, { replace: true });
    } catch (error) {
      setErrors({ form: error.message });
      setMessage('');
      setIsSubmitting(false);
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
            <strong>HarvestLink</strong>
            <small>Cebu farm-to-market</small>
          </span>
        </Link>
        <div>
          <p className="eyebrow">Prototype access</p>
          <h1>{isRegister ? 'Create your trading account.' : 'Welcome back to HarvestLink.'}</h1>
          <p>
            Farmers manage produce, orders, and surplus donations. Buyers browse harvests, check out with
            payment and delivery tracking. Partner organizations (orphanages, elder-care homes, NGOs, food
            banks) can request surplus produce donations.
          </p>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-card-header">
          <h2>{isRegister ? 'Register' : 'Login'}</h2>
          <p>{isRegister ? 'Choose your role and start trading locally.' : 'Log in to your account.'}</p>
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
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              onBlur={() => handleBlur('email')}
              placeholder="name@example.com"
            />
          </FormField>
          <FormField label="Password" name="password" error={errors.password}>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(event) => updateField('password', event.target.value)}
              onBlur={() => handleBlur('password')}
              placeholder="Enter password"
            />
          </FormField>

          {!isRegister ? (
            <Link className="auth-forgot-link" to="/forgot-password">Forgot password?</Link>
          ) : null}

          {isRegister ? (
            <FormField label="Confirm password" name="confirmPassword" error={errors.confirmPassword}>
              <input
                id="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={(event) => updateField('confirmPassword', event.target.value)}
                onBlur={() => handleBlur('confirmPassword')}
                placeholder="Re-enter password"
              />
            </FormField>
          ) : null}

          <Button type="submit" className="full-width" disabled={isSubmitting}>
            {isSubmitting
              ? (isRegister ? 'Creating account…' : 'Signing in…')
              : (isRegister ? 'Create account' : 'Sign in')}
          </Button>
        </form>

        <p className="auth-switch">
          {isRegister ? 'Already have an account?' : 'New to HarvestLink?'}{' '}
          <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Login' : 'Register'}</Link>
        </p>
      </section>
    </main>
  );
}
