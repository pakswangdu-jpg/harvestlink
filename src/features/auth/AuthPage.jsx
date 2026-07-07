import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import { CEBU_MUNICIPALITIES, ORGANIZATION_TYPES, ROLE_DASHBOARDS } from '../../utils/constants';
import { fileToDataUrl } from '../../utils/formatters';
import { hasErrors, validateAuthForm } from '../../utils/validators';
import { useAuth } from './AuthContext';
import logo from '../../assets/logo.png';

const VALID_ROLES = ['farmer', 'buyer', 'stakeholder'];

function buildEmptyForm(preselectedRole) {
  return {
    name: '',
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
  const { currentUser, login, register } = useAuth();
  const [form, setForm] = useState(() => buildEmptyForm(searchParams.get('role')));
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [isReadingFile, setIsReadingFile] = useState(false);

  if (currentUser) return <Navigate to={ROLE_DASHBOARDS[currentUser.role]} replace />;

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

  const handleFileChange = (field) => async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setIsReadingFile(true);
      const dataUrl = await fileToDataUrl(file);
      updateField(field, dataUrl);
    } catch {
      setErrors((previous) => ({ ...previous, [field]: 'Unable to read this file.' }));
    } finally {
      setIsReadingFile(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const nextErrors = validateAuthForm(form, mode);
    if (hasErrors(nextErrors)) {
      setErrors(nextErrors);
      return;
    }

    try {
      const user = isRegister ? register(form) : login(form.email, form.password);
      const fallback = ROLE_DASHBOARDS[user.role];
      navigate(location.state?.from || fallback, { replace: true });
    } catch (error) {
      setErrors({ form: error.message });
      setMessage('');
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
          <p>{isRegister ? 'Choose your role and start trading locally.' : 'Use your account or the admin shortcut.'}</p>
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
              <FormField label="Full name" name="name" error={errors.name}>
                <input
                  id="name"
                  value={form.name}
                  onChange={(event) => updateField('name', event.target.value)}
                  onBlur={() => handleBlur('name')}
                  placeholder="Juan Dela Cruz"
                />
              </FormField>
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
              <FormField label="Proof of accreditation" name="accreditationFile" helper="Optional. Stored locally as a data URL for this prototype.">
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
              <FormField label="Proof of certification / government ID" name="govIdFile" helper="Optional. Stored locally as a data URL for this prototype.">
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
          ) : null}

          <FormField label="Email address" name="email" error={errors.email} helper={!isRegister ? 'Admin: admin@harvestlink.com / admin' : ''}>
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

          <Button type="submit" className="full-width" disabled={isReadingFile}>
            {isRegister ? 'Create account' : 'Sign in'}
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
