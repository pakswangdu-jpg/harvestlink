import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Building2, CheckCircle, ClipboardCheck, Clock3, FileText, Handshake,
  ArrowLeft, LocateFixed, Mail, MapPin, ShieldCheck, UploadCloud, Users, XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import AddressAutocomplete from '../../components/common/AddressAutocomplete';
import BrandWordmark from '../../components/common/BrandWordmark';
import Button from '../../components/common/Button';
import FormAlert from '../../components/common/FormAlert';
import FormField from '../../components/common/FormField';
import PasswordInput from '../../components/common/PasswordInput';
import { setAuthPersistence } from '../../lib/supabaseClient';
import { CEBU_MUNICIPALITIES, ORGANIZATION_TYPES, ROLE_DASHBOARDS } from '../../utils/constants';
import { getProfileLocationFromPlace } from '../../utils/profileLocation';
import { reverseGeocode } from '../../services/geocodeService';
import { getAccurateDeviceLocation } from '../../utils/deviceLocation';
import { checkContactNumberAvailability } from '../../services/authService';
import { hasErrors, isValidEmail, validateAuthForm } from '../../utils/validators';
import { isValidPhilippineMobile, sanitizePhoneInput, toE164PhilippineMobile } from '../../utils/philippineMobile';
import { useAuth } from './AuthContext';
import logo from '../../assets/logo.png';
import './AuthorizedRepresentative.css';

const VALID_ROLES = ['farmer', 'buyer', 'stakeholder'];



const REMEMBERED_EMAIL_KEY = 'harvestlink:rememberedEmail';







const REGISTER_DRAFT_KEY = 'harvestlink:registerDraft';




const REGISTER_DRAFT_EXCLUDED_FIELDS = ['password', 'confirmPassword', 'govIdFile', 'accreditationFile'];
const PERSISTED_FILE_FIELDS = ['govIdFile', 'accreditationFile'];





const MAX_PERSISTED_FILE_BYTES = 4 * 1024 * 1024;
const DRAFT_SAVE_DEBOUNCE_MS = 400;
const SAVED_NOTICE_VISIBLE_MS = 2000;

function readRegisterDraft() {
  try {
    const raw = sessionStorage.getItem(REGISTER_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeRegisterDraft(form, agreedToTerms, files) {
  const draftForm = { ...form };
  REGISTER_DRAFT_EXCLUDED_FIELDS.forEach((field) => delete draftForm[field]);
  try {
    sessionStorage.setItem(REGISTER_DRAFT_KEY, JSON.stringify({ form: draftForm, agreedToTerms, files }));
  } catch {



    try {
      sessionStorage.setItem(REGISTER_DRAFT_KEY, JSON.stringify({ form: draftForm, agreedToTerms, files: null }));
    } catch {


    }
  }
}

function clearRegisterDraft() {
  try {
    sessionStorage.removeItem(REGISTER_DRAFT_KEY);
  } catch {

  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}





function dataUrlToFile(entry) {
  const [, base64] = entry.dataUrl.split(',');
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i += 1) bytes[i] = byteChars.charCodeAt(i);
  return new File([bytes], entry.name, { type: entry.type });
}

const PASSWORD_REQUIREMENTS = [
  { key: 'length', label: 'At least 8 characters', test: (value) => value.length >= 8 },
  { key: 'uppercase', label: 'One uppercase letter (A–Z)', test: (value) => /[A-Z]/.test(value) },
  { key: 'lowercase', label: 'One lowercase letter (a–z)', test: (value) => /[a-z]/.test(value) },
  { key: 'number', label: 'One number (0–9)', test: (value) => /[0-9]/.test(value) },
  { key: 'special', label: 'One special character (!@#$%^&*)', test: (value) => /[!@#$%^&*]/.test(value) },
];




const PASSWORD_STRENGTH_TIERS = [
  { minMet: 0, key: 'weak', label: 'Weak password', icon: AlertTriangle },
  { minMet: 3, key: 'medium', label: 'Medium password', icon: ShieldCheck },
  { minMet: 5, key: 'strong', label: 'Strong password', icon: CheckCircle },
];




function PasswordRequirements({ password }) {
  if (!password) return null;
  const results = PASSWORD_REQUIREMENTS.map((requirement) => ({ ...requirement, met: requirement.test(password) }));
  const metCount = results.filter((requirement) => requirement.met).length;

  const strength = [...PASSWORD_STRENGTH_TIERS].reverse().find((tier) => metCount >= tier.minMet);

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
      <p className={`password-strength-indicator ${strength.key}`}>
        <strength.icon size={14} /> {strength.label}
      </p>
    </div>
  );
}




function formatAlertMessage(message) {
  if (message && /rate limit/i.test(message)) {
    return 'Email verification limit reached. Please wait a few minutes before requesting another verification email.';
  }
  return message;
}







const KNOWN_VERIFICATION_ALERTS = {
  'Please wait a moment before requesting a new verification code.': {
    title: 'Please wait',
    message: 'Please wait a moment before requesting a new verification code.',
  },
  'Your verification code has expired. Please request a new verification code.': {
    title: 'Code expired',
    message: 'Your verification code has expired. Please request a new code.',
  },
  'Too many verification attempts. Please request a new verification code.': {
    title: 'Too many attempts',
    message: 'Too many incorrect attempts. Please request a new verification code.',
  },
  'You have reached the resend limit. Please try again later.': {
    title: 'Resend limit reached',
    message: 'You have reached the resend limit. Please try again later.',
  },
  'Incorrect verification code.\n\nPlease try again.': {
    title: 'Invalid verification code',
    message: 'The code you entered is incorrect. Please try again.',
  },
  'A new code is on its way.': {
    title: 'Verification code sent',
    message: 'A new verification code has been sent to your email.',
  },
};

function mapVerificationAlert(raw, fallbackTitle) {
  if (!raw) return null;
  return KNOWN_VERIFICATION_ALERTS[raw] || { title: fallbackTitle, message: raw };
}

const OTP_LENGTH = 6;



const RESEND_COOLDOWN_SECONDS = 60;




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







function PhoneNumberInput({ id, value, onChange, onBlur, error, isChecking }) {
  const hasValue = value.trim().length > 0;
  const isFormatValid = isValidPhilippineMobile(value);
  const showAsValid = hasValue && isFormatValid && !error;
  const showAsInvalid = hasValue && (!isFormatValid || Boolean(error));

  return (
    <div className="phone-field">
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={value}
        onChange={(event) => onChange(sanitizePhoneInput(event.target.value))}
        onBlur={onBlur}
        placeholder="09XX XXX XXXX"
        className={showAsValid ? 'is-valid' : showAsInvalid ? 'is-invalid' : ''}
      />
      {isChecking ? (
        <p className="phone-validation-message checking">Checking availability…</p>
      ) : error ? (
        <p className="phone-validation-message invalid"><AlertTriangle size={13} /> {error}</p>
      ) : hasValue && !isFormatValid ? (
        <p className="phone-validation-message invalid"><AlertTriangle size={13} /> Please enter a valid Philippine mobile number.</p>
      ) : hasValue && isFormatValid ? (
        <p className="phone-validation-message valid"><CheckCircle size={13} /> Valid Philippine mobile number</p>
      ) : null}
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






function VerificationDocumentUpload({ id, file, error, onFileSelect, onValidationError, onRemove }) {
  const [isDragging, setIsDragging] = useState(false);
  const replaceInputRef = useRef(null);
  const isImage = file instanceof File && file.type.startsWith('image/');



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
          <strong>Document uploaded successfully</strong>
          <span>{file.name} · {formatFileSize(file.size)}</span>
        </div>
        <div className="verification-upload-actions">
          <input
            ref={replaceInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            onChange={(event) => validateAndSelect(event.target.files?.[0])}
            className="verification-upload-input-hidden"
            aria-hidden="true"
            tabIndex={-1}
          />
          <button type="button" className="verification-upload-replace" onClick={() => replaceInputRef.current?.click()}>
            Replace
          </button>
          <button type="button" className="verification-upload-remove" onClick={onRemove}>
            Remove
          </button>
        </div>
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
        id={id}
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








function StakeholderRegisterFields({
  form,
  errors,
  updateField,
  handleBlur,
  isLocating,
  locationNotice,
  handleUseMyLocation,
  handlePlaceSelection,
  setFieldError,
  handleContactNumberBlur,
  isCheckingPhone,
}) {
  return (
    <div className="stakeholder-register">
      <div className="form-section">
        <div className="form-section-header">
          <span className="form-section-icon"><Building2 size={18} /></span>
          <div>
            <h3>Organization</h3>
            <p>Tell us who you&apos;re registering.</p>
          </div>
        </div>
        <div className="form-grid">
          <FormField label="Organization Name" name="organizationName" error={errors.organizationName}>
            <input
              id="organizationName"
              value={form.organizationName}
              onChange={(event) => updateField('organizationName', event.target.value)}
              onBlur={() => handleBlur('organizationName')}
              placeholder="e.g. Barili Farmers Cooperative"
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
          {form.organizationType === 'Other' ? (
            <FormField label="Specify organization type" name="organizationTypeOther" error={errors.organizationType}>
              <input
                id="organizationTypeOther"
                value={form.organizationTypeOther}
                onChange={(event) => updateField('organizationTypeOther', event.target.value)}
                onBlur={() => handleBlur('organizationType')}
                placeholder="e.g. Seed Bank Initiative"
              />
            </FormField>
          ) : null}
        </div>
        <FormField label="Organization description" name="organizationDescription" error={errors.organizationDescription}>
          <textarea
            id="organizationDescription"
            value={form.organizationDescription}
            onChange={(event) => updateField('organizationDescription', event.target.value)}
            onBlur={() => handleBlur('organizationDescription')}
            placeholder="e.g. A rice and corn farming cooperative in Barili supporting smallholder crop production."
            rows={3}
          />
        </FormField>
      </div>

      <hr className="form-section-divider" />

      <div className="form-section authorized-representative-section">
        <div className="form-section-header">
          <span className="form-section-icon"><Users size={18} /></span>
          <div>
            <h3>Authorized Representative</h3>
            <p>Who we&apos;ll reach out to.</p>
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
          <FormField label="Contact number" name="contactNumber">
            <PhoneNumberInput
              id="contactNumber"
              value={form.contactNumber}
              onChange={(next) => updateField('contactNumber', next)}
              onBlur={handleContactNumberBlur}
              error={errors.contactNumber}
              isChecking={isCheckingPhone}
            />
          </FormField>
        </div>
        <FormField label="Email Address" name="email" error={errors.email}>
          <div className="input-icon-wrap">
            <Mail size={16} className="input-icon" />
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              onBlur={() => handleBlur('email')}
              placeholder="name@example.com"
            />
          </div>
        </FormField>
        <FormField label="Password" name="password" error={errors.password}>
          <PasswordInput
            id="password"
            value={form.password}
            onChange={(event) => updateField('password', event.target.value)}
            onBlur={() => handleBlur('password')}
            placeholder="Enter password"
          />
          <PasswordRequirements password={form.password} />
        </FormField>
        <FormField label="Confirm Password" name="confirmPassword" error={errors.confirmPassword}>
          <PasswordInput
            id="confirmPassword"
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
          <span className="form-section-icon"><MapPin size={18} /></span>
          <div>
            <h3>Location</h3>
            <p>Where your organization operates.</p>
          </div>
        </div>
        <div>
          <Button type="button" variant="secondary" size="sm" onClick={handleUseMyLocation} disabled={isLocating}>
            <LocateFixed size={15} /> {isLocating ? 'Locating…' : 'Use my current location'}
          </Button>
          {locationNotice ? <p className="muted">{locationNotice}</p> : null}
        </div>
        <div className="form-grid">
          <FormField label="Province" name="province">
            <input id="province" value="Cebu" disabled />
          </FormField>
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
        </div>
        <FormField label="Barangay" name="barangay" error={errors.barangay}>
          <input
            id="barangay"
            value={form.barangay}
            onChange={(event) => updateField('barangay', event.target.value)}
            onBlur={() => handleBlur('barangay')}
            placeholder="e.g. Poblacion"
          />
        </FormField>
        <FormField label="Street / Address (optional)" name="address" error={errors.address}>
          <AddressAutocomplete
            id="address"
            value={form.address}
            onChange={(next) => updateField('address', next)}
            onSelect={handlePlaceSelection}
            onBlur={() => handleBlur('address')}
            error={errors.address}
            placeholder="House/Unit No., Street"
          />
        </FormField>
      </div>

      <hr className="form-section-divider" />

      <div className="form-section">
        <div className="form-section-header">
          <span className="form-section-icon"><ShieldCheck size={18} /></span>
          <div>
            <h3>Verification</h3>
            <p>One official document is enough to begin verification.</p>
          </div>
        </div>
        <FormField label="Verification document" name="accreditationFile" error={errors.accreditationFile}>
          <VerificationDocumentUpload
            id="accreditationFile"
            file={form.accreditationFile}
            error={errors.accreditationFile}
            onFileSelect={(file) => updateField('accreditationFile', file)}
            onValidationError={(message) => setFieldError('accreditationFile', message)}
            onRemove={() => updateField('accreditationFile', '')}
          />
        </FormField>
        <div className="verification-accepted-docs">
          <strong>Accepted documents</strong>
          <ul>
            {ACCEPTED_VERIFICATION_DOCUMENTS.map((doc) => <li key={doc}>{doc}</li>)}
          </ul>
        </div>
      </div>

      <hr className="form-section-divider" />

      <div className="form-section">
        <div className="form-section-header">
          <span className="form-section-icon"><Handshake size={18} /></span>
          <div>
            <h3>Partnership</h3>
          </div>
        </div>
        <FormField label="Why would your organization like to partner with HarvestLink?" name="partnershipDescription" error={errors.partnershipDescription}>
          <textarea
            id="partnershipDescription"
            value={form.partnershipDescription}
            onChange={(event) => updateField('partnershipDescription', event.target.value.slice(0, 500))}
            onBlur={() => handleBlur('partnershipDescription')}
            placeholder="e.g. We want direct buyer connections for our member farmers' harvests."
            rows={3}
            maxLength={500}
          />
        </FormField>
      </div>
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
    organizationTypeOther: '',
    organizationDescription: '',
    contactPerson: '',
    municipality: CEBU_MUNICIPALITIES[0],
    barangay: '',
    address: '',
    latitude: null,
    longitude: null,
    zipCode: '',
    partnershipDescription: '',
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





    if (isRegister) {
      const draft = readRegisterDraft();
      if (draft?.form) {
        const restored = { ...base, ...draft.form };
        PERSISTED_FILE_FIELDS.forEach((field) => {
          const entry = draft.files?.[field];
          if (!entry) return;
          try {
            restored[field] = dataUrlToFile(entry);
          } catch {


          }
        });
        return restored;
      }
    }
    return base;
  });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState('');
  const locationRequestRef = useRef(null);
  useEffect(() => () => locationRequestRef.current?.abort(), []);
  const [rememberMe, setRememberMe] = useState(() => !isRegister && Boolean(localStorage.getItem(REMEMBERED_EMAIL_KEY)));


  const [agreedToTerms, setAgreedToTerms] = useState(() => isRegister && Boolean(readRegisterDraft()?.agreedToTerms));
  const isStakeholderRegister = isRegister && form.role === 'stakeholder';


  const [isCheckingPhone, setIsCheckingPhone] = useState(false);


  const [showSavedNotice, setShowSavedNotice] = useState(false);


  const fileDataUrlCacheRef = useRef({});



  const lastSavedSnapshotRef = useRef('');
  const savedNoticeTimeoutRef = useRef(null);




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






  useEffect(() => {
    if (!isRegister) return undefined;
    const timeoutId = window.setTimeout(async () => {
      const files = {};
      await Promise.all(PERSISTED_FILE_FIELDS.map(async (field) => {
        const value = form[field];
        if (!(value instanceof File) || value.size > MAX_PERSISTED_FILE_BYTES) return;
        const cached = fileDataUrlCacheRef.current[field];
        if (cached?.file === value) {
          files[field] = cached.entry;
          return;
        }
        try {
          const dataUrl = await readFileAsDataUrl(value);
          const entry = { name: value.name, type: value.type, size: value.size, dataUrl };
          fileDataUrlCacheRef.current[field] = { file: value, entry };
          files[field] = entry;
        } catch {

        }
      }));

      const snapshot = JSON.stringify({ form, agreedToTerms, files });
      if (snapshot === lastSavedSnapshotRef.current) return;
      lastSavedSnapshotRef.current = snapshot;

      writeRegisterDraft(form, agreedToTerms, files);
      setShowSavedNotice(true);
      window.clearTimeout(savedNoticeTimeoutRef.current);
      savedNoticeTimeoutRef.current = window.setTimeout(() => setShowSavedNotice(false), SAVED_NOTICE_VISIBLE_MS);
    }, DRAFT_SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [isRegister, form, agreedToTerms]);



  useEffect(() => () => window.clearTimeout(savedNoticeTimeoutRef.current), []);





  if (!authLoading && currentUser && authStage !== 'submitted') {
    return <Navigate to={ROLE_DASHBOARDS[currentUser.role]} replace />;
  }

  const updateField = (field, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
      ...(field === 'address' ? { latitude: null, longitude: null, zipCode: '' } : {}),
      ...(field === 'municipality' || field === 'barangay' ? { latitude: null, longitude: null } : {}),
    }));
    setErrors((previous) => {
      const next = { ...previous, [field]: undefined, form: undefined };


      if (field === 'password' || field === 'confirmPassword') next.confirmPassword = undefined;
      return next;
    });
    setMessage('');
  };

  const handlePlaceSelection = (details) => {
    setForm((previous) => ({
      ...previous,
      ...getProfileLocationFromPlace(details, previous),
    }));
    setErrors((previous) => ({ ...previous, address: undefined }));
  };


  const handleBlur = (field) => {
    if (!isRegister && field !== 'email' && field !== 'password') return;
    const nextErrors = validateAuthForm(form, mode);
    setErrors((previous) => ({ ...previous, [field]: nextErrors[field] }));
  };




  const setFieldError = (field, message) => setErrors((previous) => ({ ...previous, [field]: message }));







  const handleContactNumberBlur = async () => {
    const nextErrors = validateAuthForm(form, mode);
    setErrors((previous) => ({ ...previous, contactNumber: nextErrors.contactNumber }));
    if (nextErrors.contactNumber) return;

    setIsCheckingPhone(true);
    try {
      const result = await checkContactNumberAvailability(form.contactNumber);
      if (!result.available && result.reason === 'duplicate') {
        setFieldError('contactNumber', 'This mobile number is already associated with an existing HarvestLink account.');
      }
    } catch {

    } finally {
      setIsCheckingPhone(false);
    }
  };





  const handleFileChange = (field) => (event) => {
    const file = event.target.files?.[0];
    if (file) updateField(field, file);
  };




  const handleUseMyLocation = async () => {
    if (isLocating) return;
    if (!navigator.geolocation) {
      setLocationNotice('Location access is not supported on this device.');
      return;
    }
    const request = new AbortController();
    locationRequestRef.current = request;
    setIsLocating(true);
    setLocationNotice('Finding your current location with the best available accuracy...');
    let detectedPosition;
    try {
      detectedPosition = await getAccurateDeviceLocation(navigator.geolocation, { signal: request.signal });
      const { latitude, longitude, accuracy } = detectedPosition.coords;
      const reverse = await reverseGeocode({ lat: latitude, lng: longitude });
      if (request.signal.aborted) return;
      const accuracyText = ` Location accuracy is about ${Math.round(accuracy)} m.`;
      if (!reverse) {
        setLocationNotice(`No address was found for your location.${accuracyText} Please enter the address manually.`);
        return;
      }
      if (!reverse.municipality) {
        setLocationNotice(`The detected city could not be matched to a supported Cebu municipality.${accuracyText} Your existing address has not been changed.`);
        return;
      }
      setForm((previous) => ({
        ...previous,
        municipality: reverse.municipality,
        address: isStakeholderRegister ? reverse.street : reverse.address,
        ...(isStakeholderRegister ? { barangay: reverse.barangay } : {}),
        zipCode: reverse.zipCode,
        latitude,
        longitude,
      }));
      setErrors((previous) => ({
        ...previous, municipality: undefined, address: undefined,
        ...(isStakeholderRegister ? { barangay: undefined } : {}),
        form: undefined,
      }));
      setMessage('');
      const missing = [
        isStakeholderRegister && !reverse.barangay ? 'barangay' : null,
        !reverse.street ? 'street' : null,
      ].filter(Boolean);
      const missingText = missing.length ? ` Please enter the ${missing.join(' and ')} manually; it was not returned by the map.` : '';
      const lowAccuracyText = accuracy > 100
        ? ' This reading is approximate. Please verify the address or retry where GPS reception is better.'
        : ' Please double-check the detected address.';
      setLocationNotice(`Location fields updated.${accuracyText}${missingText}${lowAccuracyText}`);
    } catch (error) {
      if (request.signal.aborted) return;
      setLocationNotice(
        detectedPosition
          ? 'Your location was detected, but the address lookup failed. Please retry or enter the address manually.'
          : error.code === 1
            ? 'Location permission denied. You can still fill this in manually.'
            : error.code === 3
              ? 'Location timed out. Please try again or fill this in manually.'
              : 'Location unavailable. Please try again or fill this in manually.',
      );
    } finally {
      if (!request.signal.aborted) setIsLocating(false);
      if (locationRequestRef.current === request) locationRequestRef.current = null;
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validateAuthForm(form, mode);
    if (hasErrors(nextErrors)) {
      setErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);



    const submitForm = isRegister
      ? {
          ...form,
          contactNumber: toE164PhilippineMobile(form.contactNumber),
          organizationType: form.organizationType === 'Other' ? form.organizationTypeOther.trim() : form.organizationType,
        }
      : form;
    try {
      if (!isRegister) setAuthPersistence(rememberMe);
      const result = isRegister ? await register(submitForm) : await login(form.email, form.password);
      if (isRegister && result.pendingVerification) {
        setOtpEmail(form.email.trim().toLowerCase());
        setPendingFiles({ govIdFile: form.govIdFile, accreditationFile: form.accreditationFile, role: form.role });
        setOtpValue('');
        setOtpError('');
        setOtpNotice('We sent a verification code to your email. Enter the 6-digit code to complete registration.');
        setAuthStage('otp');
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
        setIsSubmitting(false);
        return;
      }
      if (isRegister) clearRegisterDraft();
      if (!isRegister) {
        if (rememberMe) localStorage.setItem(REMEMBERED_EMAIL_KEY, form.email.trim().toLowerCase());
        else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }
      const fallback = ROLE_DASHBOARDS[result.role];
      navigate(location.state?.from || fallback, { replace: true });
    } catch (error) {


      if (!isRegister && error.code === 'email_not_confirmed') {
        const email = form.email.trim().toLowerCase();
        setOtpEmail(email);
        setPendingFiles({});
        setOtpValue('');
        setOtpError('');
        setOtpNotice("Your email isn't verified yet. We've sent a new verification code — enter it below to continue.");
        setAuthStage('otp');
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
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
      if (!isRegister) setAuthPersistence(rememberMe);
      const user = await verifyOtp(otpEmail, otpValue, form.password, pendingFiles);
      if (isRegister) clearRegisterDraft();
      if (!isRegister) {
        if (rememberMe) localStorage.setItem(REMEMBERED_EMAIL_KEY, otpEmail);
        else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }




      if (isStakeholderRegister) {
        setAuthStage('submitted');
        setIsVerifyingOtp(false);
        return;
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
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
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






  const isRegisterFormReady = !isRegister || (
    isValidPhilippineMobile(form.contactNumber)
    && isValidEmail(form.email)
    && PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(form.password))
    && agreedToTerms
  );



  const isBusy = authStage === 'otp' ? isVerifyingOtp : isSubmitting;

  const otpNoticeAlert = mapVerificationAlert(otpNotice, 'Verification code sent');
  const otpErrorAlert = mapVerificationAlert(otpError, 'Verification failed');

  return (
    <main className={`auth-page ${isRegister ? 'auth-page-register' : 'auth-page-login'} ${isStakeholderRegister ? 'auth-page-stakeholder' : ''}`}>
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

      <section className={`auth-card ${isRegister ? 'auth-card-register' : 'auth-card-login'} ${isStakeholderRegister ? 'auth-card-glass' : ''}`}>
        <Button
          variant="ghost"
          size="sm"
          className="auth-back-button"
          onClick={() => navigate('/')}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back
        </Button>
        <Link to="/" className="auth-card-brand">
          <span className="brand-mark">
            <img src={logo} alt="" />
          </span>
          <strong><BrandWordmark /></strong>
        </Link>

        <div className="auth-card-header">
          <h2>
            {authStage === 'submitted'
              ? 'Partnership Application Submitted'
              : authStage === 'otp'
                ? 'Verify your email'
                : isStakeholderRegister ? 'Partner Organization Registration' : isRegister ? 'Register' : 'Welcome back'}
          </h2>
          <p>
            {authStage === 'submitted'
              ? "Thank you for your interest in partnering with HarvestLink. Our team will review your organization's information and contact your authorized representative once verification is complete."
              : authStage === 'otp'
                ? 'Enter the 6-digit code we emailed you to finish this.'
                : isStakeholderRegister ? "Fill in your organization's details to get started." : isRegister ? 'Choose your role and start trading locally.' : 'Sign in to your HarvestLink account'}
          </p>
        </div>

        <form
          className={`form-stack ${isRegister && authStage !== 'otp' ? 'register-form' : ''}`}
          onSubmit={authStage === 'otp' ? handleVerifyOtp : handleSubmit}
        >
          {errors.form ? (
            <FormAlert
              type="error"
              title={isRegister ? 'Registration failed' : 'Sign-in failed'}
              message={formatAlertMessage(errors.form)}
            />
          ) : null}
          {message ? <FormAlert type="success" message={message} /> : null}

          {authStage === 'submitted' ? (
            <div className="submitted-stage">
              <span className="submitted-icon"><ClipboardCheck size={28} /></span>
              <span className="submitted-status-badge"><Clock3 size={13} /> Pending Verification</span>
            </div>
          ) : authStage === 'otp' ? (
            <div className="otp-stage">
              <span className="otp-icon"><Mail size={22} /></span>
              <p className="otp-instructions">
                We sent a verification code to <strong>{otpEmail}</strong>. Enter the 6-digit code from the email to verify your account.
              </p>
              {otpNoticeAlert ? <FormAlert type="info" title={otpNoticeAlert.title} message={otpNoticeAlert.message} /> : null}
              {otpErrorAlert ? <FormAlert type="error" title={otpErrorAlert.title} message={formatAlertMessage(otpErrorAlert.message)} /> : null}
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
                  handlePlaceSelection={handlePlaceSelection}
                  setFieldError={setFieldError}
                  handleContactNumberBlur={handleContactNumberBlur}
                  isCheckingPhone={isCheckingPhone}
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
                        <FormField label="Contact number" name="contactNumber">
                          <PhoneNumberInput
                            id="contactNumber"
                            value={form.contactNumber}
                            onChange={(next) => updateField('contactNumber', next)}
                            onBlur={handleContactNumberBlur}
                            error={errors.contactNumber}
                            isChecking={isCheckingPhone}
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
                      <FormField label="Contact number" name="contactNumber">
                        <PhoneNumberInput
                          id="contactNumber"
                          value={form.contactNumber}
                          onChange={(next) => updateField('contactNumber', next)}
                          onBlur={handleContactNumberBlur}
                          error={errors.contactNumber}
                          isChecking={isCheckingPhone}
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
                      <div className="form-grid address-row">
                        <FormField label="Complete address" name="address" error={errors.address}>
                          <AddressAutocomplete
                            id="address"
                            value={form.address}
                            onChange={(next) => updateField('address', next)}
                            onSelect={handlePlaceSelection}
                            onBlur={() => handleBlur('address')}
                            error={errors.address}
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
                    <div className="input-icon-wrap">
                      <Mail size={16} className="input-icon" />
                      <input
                        id="email"
                        type="email"
                        value={form.email}
                        onChange={(event) => updateField('email', event.target.value)}
                        onBlur={() => handleBlur('email')}
                        placeholder="name@example.com"
                      />
                    </div>
                  </FormField>
                  {

                                                                                                 }
                  <FormField label="Password" name="password" error={errors.password}>
                    <PasswordInput
                      id="password"
                      value={form.password}
                      onChange={(event) => updateField('password', event.target.value)}
                      onBlur={() => handleBlur('password')}
                      placeholder="Enter password"
                    />
                    <PasswordRequirements password={form.password} />
                  </FormField>
                  <FormField label="Confirm password" name="confirmPassword" error={errors.confirmPassword}>
                    <PasswordInput
                      id="confirmPassword"
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
                <div className="input-icon-wrap">
                  <Mail size={16} className="input-icon" />
                  <input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(event) => updateField('email', event.target.value)}
                    onBlur={() => handleBlur('email')}
                    placeholder="name@example.com"
                  />
                </div>
              </FormField>
              <FormField label="Password" name="password" error={errors.password}>
                <PasswordInput
                  id="password"
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

          {isRegister && authStage === 'form' ? (
            <label className="auth-terms-row">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(event) => setAgreedToTerms(event.target.checked)}
                aria-required="true"
              />
              <span>
                I agree to the{' '}
                {




                                                                  }
                <Link to="/terms-of-service?returnTo=/register"><strong>Terms of Service</strong></Link>
                {' '}and{' '}
                <Link to="/privacy-policy?returnTo=/register"><strong>Privacy Policy</strong></Link>.
              </span>
            </label>
          ) : null}

          {isRegister && authStage === 'form' ? (
            <p className={`autosave-notice${showSavedNotice ? ' visible' : ''}`} role="status" aria-live="polite">
              <CheckCircle size={14} /> Your progress is automatically saved.
            </p>
          ) : null}

          {authStage === 'submitted' ? (
            <Button
              type="button"
              className="full-width auth-submit"
              onClick={() => navigate(location.state?.from || ROLE_DASHBOARDS.stakeholder, { replace: true })}
            >
              Go to my dashboard
            </Button>
          ) : (
            <Button
              type="submit"
              className="full-width auth-submit"
              aria-busy={isBusy}
              disabled={
                authStage === 'otp'
                  ? otpValue.length !== OTP_LENGTH || isVerifyingOtp
                  : isSubmitting || !isRegisterFormReady
              }
            >
              {isBusy ? <span className="btn-spinner" aria-hidden="true" /> : null}
              {authStage === 'otp'
                ? (isVerifyingOtp ? 'Verifying…' : 'Verify email')
                : isSubmitting
                  ? (isStakeholderRegister ? 'Submitting…' : isRegister ? 'Creating account…' : 'Signing in…')
                  : (isStakeholderRegister ? 'Submit Partnership Application' : isRegister ? 'Create account' : 'Sign in')}
            </Button>
          )}
        </form>

        {authStage === 'form' ? (
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
