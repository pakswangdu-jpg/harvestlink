import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Building2, CheckCircle, FileText, KeyRound, LocateFixed, Mail, MapPin,
  ShieldCheck, UploadCloud, Users, X, XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
// Kept separate from the real login() call so the login logic itself stays untouched.
const REMEMBERED_EMAIL_KEY = 'harvestlink:rememberedEmail';

const PASSWORD_REQUIREMENTS = [
  { key: 'length', label: 'At least 8 characters', test: (value) => value.length >= 8 },
  { key: 'uppercase', label: 'One uppercase letter (A–Z)', test: (value) => /[A-Z]/.test(value) },
  { key: 'lowercase', label: 'One lowercase letter (a–z)', test: (value) => /[a-z]/.test(value) },
  { key: 'number', label: 'One number (0–9)', test: (value) => /[0-9]/.test(value) },
  { key: 'special', label: 'One special character (!@#$%^&*)', test: (value) => /[!@#$%^&*]/.test(value) },
];

// Shown only once the farmer/buyer/stakeholder starts typing a password during
// registration — login's password field just needs an existing password, not a strength
// checklist, so this is never rendered there.
function PasswordRequirements({ password }) {
  if (!password) return null;
  const results = PASSWORD_REQUIREMENTS.map((requirement) => ({ ...requirement, met: requirement.test(password) }));
  const isStrong = results.every((requirement) => requirement.met);

  return (
    <div className="password-requirements">
      <ul>
        {results.map((requirement) => (
          <li key={requirement.key} className={requirement.met ? 'met' : ''}>
            {requirement.met ? <CheckCircle size={14} /> : <XCircle size={14} />}
            {requirement.label}
          </li>
        ))}
      </ul>
      {isStrong ? <p className="password-strong-indicator"><CheckCircle size={14} /> Strong password</p> : null}
    </div>
  );
}

// Supabase's raw error strings are written for a developer, not the person hitting them —
// this only swaps display copy for the ones users can actually run into here; it doesn't
// change what gets thrown or how the app reacts to it.
function formatAlertMessage(message) {
  if (message && /rate limit/i.test(message)) {
    return 'Email verification limit reached. Please wait a few minutes before requesting another verification email.';
  }
  return message;
}

const OTP_LENGTH = 6;

// One box per digit — the standard OTP input pattern (Gmail, banking apps, etc.): numeric
// keypad on mobile (inputMode), digit-only filtering, auto-advances to the next box as you
// type and back on backspace, and accepts a full pasted code in one go.
function OtpInput({ value, onChange, disabled }) {
  const inputRefs = useRef([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, index) => value[index] || '');

  const handleChange = (index, rawValue) => {
    const digit = rawValue.replace(/\D/g, '').slice(-1);
    const nextDigits = [...digits];
    nextDigits[index] = digit;
    onChange(nextDigits.join(''));
    if (digit && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, event) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (event) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    inputRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  };

  return (
    <div className="otp-input-group" onPaste={handlePaste}>
      {digits.map((digit, index) => (
        <input
          // Fixed-length, position-addressed boxes that are never reordered — array index
          // is a safe, stable key here.
          key={index}
          ref={(element) => { inputRefs.current[index] = element; }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          className="otp-digit"
          aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
        />
      ))}
    </div>
  );
}

// Visual replacement for the raw OS file-picker button — the real <input type="file">
// still sits on top (see .file-upload-input in globals.css), so selection, accept
// filtering, and the onChange handler passed in are completely unchanged.
function FileUploadField({ id, accept, file, onChange }) {
  const fileName = file instanceof File ? file.name : '';
  return (
    <div className="file-upload">
      <input id={id} type="file" accept={accept} onChange={onChange} className="file-upload-input" />
      <div className="file-upload-dropzone">
        <UploadCloud size={18} className="file-upload-icon" />
        <span className="file-upload-text">
          {fileName ? <span className="file-upload-filename">{fileName}</span> : 'Click to upload a file (image or PDF)'}
        </span>
      </div>
    </div>
  );
}

const VERIFICATION_ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const VERIFICATION_ACCEPTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];
const VERIFICATION_MAX_SIZE_BYTES = 10 * 1024 * 1024;

const ACCEPTED_VERIFICATION_DOCUMENTS = [
  'Department of Agriculture (DA) Accreditation',
  'CDA Certificate (Agricultural Cooperative)',
  'SEC Registration',
  'DTI Business Registration (if applicable)',
  "Mayor's or Business Permit",
  'Farmer Association Registration',
  'Cooperative Registration',
  'Certificate of Registration',
  'Other Government-Issued Agricultural Organization Documents',
];

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Drag-and-drop replacement for the "Proof of accreditation" file field — same underlying
// accreditationFile state key and accreditation_file_url backend column as before (see
// authService.registerUser / buildRoleFields), just a richer picker: real drag-and-drop,
// an image thumbnail or PDF icon once a file is chosen, and inline type/size validation
// instead of only finding out a file was rejected after trying to submit.
function VerificationDocumentUpload({ file, error, onFileSelect, onValidationError, onRemove }) {
  const [isDragging, setIsDragging] = useState(false);
  const isImage = file instanceof File && file.type.startsWith('image/');
  const isPdf = file instanceof File && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));

  // Computed synchronously during render (not via setState-in-effect) — the effect below
  // only handles revoking it again, a legitimate external-resource cleanup.
  const previewUrl = useMemo(() => (isImage ? URL.createObjectURL(file) : ''), [file, isImage]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const validateAndSelect = (candidate) => {
    if (!candidate) return;
    const extension = `.${candidate.name.split('.').pop()?.toLowerCase() || ''}`;
    const isAcceptedType = VERIFICATION_ACCEPTED_TYPES.includes(candidate.type) || VERIFICATION_ACCEPTED_EXTENSIONS.includes(extension);
    if (!isAcceptedType) {
      onValidationError('Only PDF, JPG, JPEG, or PNG files are accepted.');
      return;
    }
    if (candidate.size > VERIFICATION_MAX_SIZE_BYTES) {
      onValidationError('File size must be under 10 MB.');
      return;
    }
    onFileSelect(candidate);
  };

  if (file instanceof File) {
    return (
      <div className={`verification-upload-preview${error ? ' has-error' : ''}`}>
        {isImage ? (
          <img src={previewUrl} alt="" className="verification-upload-thumb" />
        ) : (
          <span className="verification-upload-icon"><FileText size={22} /></span>
        )}
        <div className="verification-upload-meta">
          <strong>{file.name}</strong>
          <span>{isPdf ? 'PDF document' : 'Image'} · {formatFileSize(file.size)}</span>
        </div>
        <button type="button" className="verification-upload-remove" onClick={onRemove} aria-label="Remove file">
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`verification-upload-dropzone${isDragging ? ' dragging' : ''}${error ? ' has-error' : ''}`}
      onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        validateAndSelect(event.dataTransfer.files?.[0]);
      }}
    >
      <input
        id="accreditationFile"
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        onChange={(event) => validateAndSelect(event.target.files?.[0])}
        className="verification-upload-input"
        aria-label="Upload verification document"
      />
      <UploadCloud size={24} className="verification-upload-cloud" />
      <p><strong>Drag and drop</strong> your document here, or click to browse</p>
      <span className="verification-upload-hint">PDF, JPG, JPEG, or PNG — up to 10 MB</span>
    </div>
  );
}

// Dedicated, more elaborate layout for the "Partner Organization Registration" experience
// (role === 'stakeholder') — same form state, change handlers, blur validation, and submit
// button as every other role; this only organizes the exact same fields into labeled
// sections instead of one flat list. Note "Position / Role" below is still backed by the
// same contactPerson key/column as before — just re-labeled, since firstName/lastName
// already capture the representative's name, so this slot is free to describe their title
// within the organization instead of duplicating it.
function StakeholderRegisterFields({
  form, errors, updateField, handleBlur, isLocating, locationNotice, handleUseMyLocation,
  agreedToTerms, setAgreedToTerms, setFieldError,
}) {
  return (
    <div className="stakeholder-register">
      <div className="form-section">
        <div className="form-section-header">
          <span className="form-section-icon"><Building2 size={18} /></span>
          <div>
            <h3>Organization Information</h3>
            <p>Tell us about the organization you&apos;re registering.</p>
          </div>
        </div>
        <div className="form-grid">
          <FormField label="Organization Name" name="organizationName" error={errors.organizationName}>
            <input
              id="organizationName"
              value={form.organizationName}
              onChange={(event) => updateField('organizationName', event.target.value)}
              onBlur={() => handleBlur('organizationName')}
              placeholder="Cebu Children's Home"
            />
          </FormField>
          <FormField label="Organization Type" name="organizationType" error={errors.organizationType}>
            <select
              id="organizationType"
              value={form.organizationType}
              onChange={(event) => updateField('organizationType', event.target.value)}
              onBlur={() => handleBlur('organizationType')}
            >
              {ORGANIZATION_TYPES.map((type) => <option key={type}>{type}</option>)}
            </select>
          </FormField>
        </div>
      </div>

      <hr className="form-section-divider" />

      <div className="form-section">
        <div className="form-section-header">
          <span className="form-section-icon"><Users size={18} /></span>
          <div>
            <h3>Authorized Representative</h3>
            <p>Who we&apos;ll coordinate donations and outreach with.</p>
          </div>
        </div>
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
          <FormField label="Middle name (optional)" name="middleName" error={errors.middleName}>
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
        <div className="form-grid">
          <FormField label="Position / Role" name="contactPerson" error={errors.contactPerson}>
            <input
              id="contactPerson"
              value={form.contactPerson}
              onChange={(event) => updateField('contactPerson', event.target.value)}
              onBlur={() => handleBlur('contactPerson')}
              placeholder="e.g. Program Director, Coordinator"
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
      </div>

      <hr className="form-section-divider" />

      <div className="form-section">
        <div className="form-section-header">
          <span className="form-section-icon"><MapPin size={18} /></span>
          <div>
            <h3>Organization Address</h3>
            <p>Where farmers and riders can reach you.</p>
          </div>
        </div>
        <div className="form-grid">
          <FormField label="Municipality / City" name="municipality" error={errors.municipality}>
            <select
              id="municipality"
              value={form.municipality}
              onChange={(event) => updateField('municipality', event.target.value)}
              onBlur={() => handleBlur('municipality')}
            >
              {CEBU_MUNICIPALITIES.map((municipality) => <option key={municipality}>{municipality}</option>)}
            </select>
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
        <FormField label="Complete address" name="address" error={errors.address}>
          <input
            id="address"
            value={form.address}
            onChange={(event) => updateField('address', event.target.value)}
            onBlur={() => handleBlur('address')}
            placeholder="House/Unit No., Street, Barangay"
          />
        </FormField>
        <div>
          <Button type="button" variant="secondary" size="sm" onClick={handleUseMyLocation} disabled={isLocating}>
            <LocateFixed size={15} /> {isLocating ? 'Locating…' : 'Use my current location'}
          </Button>
          {locationNotice ? <p className="muted">{locationNotice}</p> : null}
        </div>
      </div>

      <hr className="form-section-divider" />

      <div className="form-section">
        <div className="form-section-header">
          <span className="form-section-icon"><KeyRound size={18} /></span>
          <div>
            <h3>Account Information</h3>
            <p>How you&apos;ll sign in from now on.</p>
          </div>
        </div>
        <FormField label="Email Address" name="email" error={errors.email}>
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
          <PasswordRequirements password={form.password} />
        </FormField>
        <FormField label="Confirm Password" name="confirmPassword" error={errors.confirmPassword}>
          <input
            id="confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={(event) => updateField('confirmPassword', event.target.value)}
            onBlur={() => handleBlur('confirmPassword')}
            placeholder="Re-enter password"
          />
        </FormField>
      </div>

      <hr className="form-section-divider" />

      <div className="form-section">
        <div className="form-section-header">
          <span className="form-section-icon"><ShieldCheck size={18} /></span>
          <div>
            <h3>Agricultural Organization Verification</h3>
            <p>One official document to help us confirm your organization is legitimate.</p>
          </div>
        </div>
        <FormField label="Verification Document" name="accreditationFile" error={errors.accreditationFile}>
          <VerificationDocumentUpload
            file={form.accreditationFile}
            error={errors.accreditationFile}
            onFileSelect={(file) => updateField('accreditationFile', file)}
            onValidationError={(message) => setFieldError('accreditationFile', message)}
            onRemove={() => updateField('accreditationFile', '')}
          />
        </FormField>
        <div className="verification-accepted-docs">
          <strong>Accepted Verification Documents</strong>
          <ul>
            {ACCEPTED_VERIFICATION_DOCUMENTS.map((doc) => <li key={doc}>{doc}</li>)}
          </ul>
        </div>
        <div className="form-alert info has-icon verification-notice">
          <ShieldCheck size={16} />
          <span>
            Your verification document will only be reviewed by the HarvestLink administrator to verify the
            legitimacy of your agricultural organization. All submitted documents are kept confidential and
            securely stored.
          </span>
        </div>
      </div>

      <label className="auth-terms-row">
        <input
          type="checkbox"
          checked={agreedToTerms}
          onChange={(event) => setAgreedToTerms(event.target.checked)}
          aria-required="true"
        />
        <span>I agree to the <strong>Terms and Conditions</strong> and <strong>Privacy Policy</strong>.</span>
      </label>
    </div>
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
  const { currentUser, loading: authLoading, login, register, verifyOtp, resendOtp } = useAuth();
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
  // Partner-organization registration only (see StakeholderRegisterFields) — a client-side
  // gate on the submit button, not sent anywhere; farmer/buyer registration is unaffected.
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const isStakeholderRegister = isRegister && form.role === 'stakeholder';

  // 'otp' covers two entry points: right after registering (always required now — see
  // authService.registerUser), and a returning-but-never-verified user hitting "Email not
  // confirmed" on the login page (see handleSubmit's catch block below).
  const [authStage, setAuthStage] = useState('form');
  const [otpEmail, setOtpEmail] = useState('');
  const [otpValue, setOtpValue] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpNotice, setOtpNotice] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [pendingFiles, setPendingFiles] = useState({});
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setInterval(() => setResendCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

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

  // For validation that can't be expressed as a simple required()/format check in
  // validateAuthForm — e.g. VerificationDocumentUpload rejecting a file for its type or
  // size the moment it's dropped, rather than waiting for submit.
  const setFieldError = (field, message) => setErrors((previous) => ({ ...previous, [field]: message }));

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
      // Registration is instant-confirmed again (see authService.registerUser) — register()
      // and login() both just return a logged-in user now, so they navigate the same way.
      const user = isRegister ? await register(form) : await login(form.email, form.password);
      if (!isRegister) {
        if (rememberMe) localStorage.setItem(REMEMBERED_EMAIL_KEY, form.email.trim().toLowerCase());
        else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }
      const fallback = ROLE_DASHBOARDS[user.role];
      navigate(location.state?.from || fallback, { replace: true });
    } catch (error) {
      // Dormant for any newly-created account (they're instant-confirmed now), but kept as
      // a safety net for an already-existing unconfirmed account from before this reverted —
      // sends them to the same OTP screen instead of a dead-end error.
      if (!isRegister && error.code === 'email_not_confirmed') {
        const email = form.email.trim().toLowerCase();
        setOtpEmail(email);
        setPendingFiles({});
        setOtpValue('');
        setOtpError('');
        setOtpNotice("Your email isn't verified yet. We've sent a new code — enter it below.");
        setAuthStage('otp');
        setResendCooldown(45);
        resendOtp(email).catch(() => {});
        setIsSubmitting(false);
        return;
      }
      setErrors({ form: error.message });
      setMessage('');
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (event) => {
    event.preventDefault();
    if (otpValue.length !== OTP_LENGTH) return;
    setOtpError('');
    setIsVerifyingOtp(true);
    try {
      const user = await verifyOtp(otpEmail, otpValue, pendingFiles);
      if (!isRegister) {
        if (rememberMe) localStorage.setItem(REMEMBERED_EMAIL_KEY, otpEmail);
        else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }
      const fallback = ROLE_DASHBOARDS[user.role];
      navigate(location.state?.from || fallback, { replace: true });
    } catch (error) {
      setOtpError(error.message);
      setIsVerifyingOtp(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setOtpError('');
    setOtpNotice('');
    try {
      await resendOtp(otpEmail);
      setOtpNotice('A new code is on its way.');
      setResendCooldown(45);
    } catch (error) {
      setOtpError(error.message);
    }
  };

  const handleBackToForm = () => {
    setAuthStage('form');
    setOtpValue('');
    setOtpError('');
    setOtpNotice('');
    setResendCooldown(0);
  };

  return (
    <main className={`auth-page ${isRegister ? 'auth-page-register' : ''} ${isStakeholderRegister ? 'auth-page-stakeholder' : ''}`}>
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
          <h1>
            {isStakeholderRegister
              ? 'Partner Organization Registration'
              : isRegister ? 'Create your trading account.' : 'Welcome back to HarvestLink.'}
          </h1>
          <p>
            {isStakeholderRegister
              ? "Join HarvestLink as a partner organization and collaborate with Cebu farmers by supporting agricultural communities through donations and outreach programs."
              : 'Farmers manage produce, orders, and surplus donations. Buyers browse harvests, check out with payment and delivery tracking. Partner organizations (orphanages, elder-care homes, NGOs, food banks) can request surplus produce donations.'}
          </p>
        </div>
      </section>

      <section className={`auth-card ${isRegister ? 'auth-card-register' : ''} ${isStakeholderRegister ? 'auth-card-glass' : ''}`}>
        <div className="auth-card-header">
          <h2>
            {authStage === 'otp'
              ? 'Verify your email'
              : isStakeholderRegister ? 'Partner Organization Registration' : isRegister ? 'Register' : 'Login'}
          </h2>
          <p>
            {authStage === 'otp'
              ? 'Enter the 6-digit code we emailed you to finish this.'
              : isStakeholderRegister ? "Fill in your organization's details to get started." : isRegister ? 'Choose your role and start trading locally.' : 'Log in to your account.'}
          </p>
        </div>

        <form
          className={`form-stack ${isRegister && authStage !== 'otp' ? 'register-form' : ''}`}
          onSubmit={authStage === 'otp' ? handleVerifyOtp : handleSubmit}
        >
          {errors.form ? (
            <div className="form-alert error has-icon">
              <AlertTriangle size={16} />
              <span>{formatAlertMessage(errors.form)}</span>
            </div>
          ) : null}
          {message ? <div className="form-alert success">{message}</div> : null}

          {authStage === 'otp' ? (
            <div className="otp-stage">
              <span className="otp-icon"><Mail size={22} /></span>
              <p className="otp-instructions">
                We sent a 6-digit code to <strong>{otpEmail}</strong>. It expires after a while, so verify soon.
              </p>
              {otpNotice ? <div className="form-alert info">{otpNotice}</div> : null}
              {otpError ? (
                <div className="form-alert error has-icon">
                  <AlertTriangle size={16} />
                  <span>{formatAlertMessage(otpError)}</span>
                </div>
              ) : null}
              <OtpInput value={otpValue} onChange={setOtpValue} disabled={isVerifyingOtp} />
              <div className="otp-footer">
                <button type="button" onClick={handleResendOtp} disabled={resendCooldown > 0}>
                  {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
                </button>
                <button type="button" onClick={handleBackToForm}>
                  {isRegister ? 'Back to form' : 'Use a different account'}
                </button>
              </div>
            </div>
          ) : isRegister ? (
            <div className={`register-fields-scroll ${isStakeholderRegister ? 'stakeholder-mode' : ''}`}>
              <FormField label="Account type" name="role" error={errors.role}>
                <select id="role" value={form.role} onChange={(event) => updateField('role', event.target.value)}>
                  <option value="farmer">Farmer</option>
                  <option value="buyer">Buyer</option>
                  <option value="stakeholder">Partner organization (donation recipient)</option>
                </select>
              </FormField>

              {form.role === 'stakeholder' ? (
                <StakeholderRegisterFields
                  form={form}
                  errors={errors}
                  updateField={updateField}
                  handleBlur={handleBlur}
                  isLocating={isLocating}
                  locationNotice={locationNotice}
                  handleUseMyLocation={handleUseMyLocation}
                  agreedToTerms={agreedToTerms}
                  setAgreedToTerms={setAgreedToTerms}
                  setFieldError={setFieldError}
                />
              ) : (
                <>
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
                    <FormField label="Middle name (optional)" name="middleName" error={errors.middleName}>
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

                  {form.role === 'farmer' ? (
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
                        <FileUploadField
                          id="govIdFile"
                          accept="image/*,.pdf"
                          file={form.govIdFile}
                          onChange={handleFileChange('govIdFile')}
                        />
                      </FormField>
                    </>
                  ) : null}

                  {form.role === 'buyer' ? (
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

                  {['farmer', 'buyer'].includes(form.role) ? (
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
                  {/* Full width, not side-by-side in a form-grid — the requirements checklist
                      only appears under Password, so a shared row would leave Confirm Password
                      stranded next to a much taller cell with a lot of dead space beneath it. */}
                  <FormField label="Password" name="password" error={errors.password}>
                    <input
                      id="password"
                      type="password"
                      value={form.password}
                      onChange={(event) => updateField('password', event.target.value)}
                      onBlur={() => handleBlur('password')}
                      placeholder="Enter password"
                    />
                    <PasswordRequirements password={form.password} />
                  </FormField>
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
                </>
              )}
            </div>
          ) : (
            <>
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
            </>
          )}

          <Button
            type="submit"
            className="full-width"
            disabled={
              authStage === 'otp'
                ? otpValue.length !== OTP_LENGTH || isVerifyingOtp
                : isSubmitting || (isStakeholderRegister && !agreedToTerms)
            }
          >
            {authStage === 'otp'
              ? (isVerifyingOtp ? 'Verifying…' : 'Verify email')
              : isSubmitting
                ? (isStakeholderRegister ? 'Creating Account...' : isRegister ? 'Creating account…' : 'Signing in…')
                : (isStakeholderRegister ? 'Create Organization Account' : isRegister ? 'Create account' : 'Sign in')}
          </Button>
        </form>

        {authStage !== 'otp' ? (
          <p className="auth-switch">
            {isRegister ? 'Already have an account?' : 'New to HarvestLink?'}{' '}
            <Link to={isRegister ? '/login' : '/register'}>
              {isRegister ? (isStakeholderRegister ? 'Sign In' : 'Login') : 'Register'}
            </Link>
          </p>
        ) : null}
      </section>
    </main>
  );
}
