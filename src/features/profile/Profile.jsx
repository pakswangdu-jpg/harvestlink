import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BadgeCheck, Building2, Calendar, Camera, CheckCircle2, Circle, CircleAlert, Edit3, ImagePlus, Lock, Mail, MapPin, Phone, QrCode, ShieldCheck, Store, Trash2, UserSquare, X } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import AddressAutocomplete from '../../components/common/AddressAutocomplete';
import Button from '../../components/common/Button';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import FormField from '../../components/common/FormField';
import InfoRow from '../../components/common/InfoRow';
import FilePreviewCard from '../../components/common/FilePreviewCard';
import ZoomableImage from '../../components/common/ZoomableImage';
import { useAuth } from '../auth/AuthContext';
import { changePassword, updateUserProfile } from '../../services/authService';
import { getSignedDocumentUrl, uploadAvatar, uploadPaymentQr } from '../../services/uploadService';
import { CEBU_MUNICIPALITIES, ORGANIZATION_TYPES } from '../../utils/constants';
import { formatDate, getInitials } from '../../utils/formatters';
import { buildProfileDraft } from '../../utils/profileDraft';
import { hasErrors, validateGcashForm, validatePasswordForm, validateProfileForm } from '../../utils/validators';
import { farmerNavItems } from '../farmer/farmerNav';
import { buyerNavItems } from '../buyer/buyerNav';
import { stakeholderNavItems } from '../stakeholder/stakeholderNav';

const NAV_ITEMS_BY_ROLE = {
  farmer: farmerNavItems,
  buyer: buyerNavItems,
  stakeholder: stakeholderNavItems,
};

const EMPTY_PASSWORD_DRAFT = { currentPassword: '', newPassword: '', confirmPassword: '' };

export default function Profile() {
  const { currentUser, refreshUser } = useAuth();
  const navItems = NAV_ITEMS_BY_ROLE[currentUser.role];
  const isFarmer = currentUser.role === 'farmer';
  const isStakeholder = currentUser.role === 'stakeholder';
  // Roles without a verification workflow (e.g. buyers) have no verificationStatus at all —
  // that's an "Active" account, same good-standing state as an explicitly verified one.
  // Only 'pending'/'rejected' should read as anything less than good.
  const isAccountVerified = !currentUser.verificationStatus || currentUser.verificationStatus === 'verified';

  const [isEditing, setIsEditing] = useState(false);
  const [profileDraft, setProfileDraft] = useState(() => buildProfileDraft(currentUser));
  const [profileErrors, setProfileErrors] = useState({});
  const [profileNotice, setProfileNotice] = useState('');

  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState(EMPTY_PASSWORD_DRAFT);
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordNotice, setPasswordNotice] = useState('');

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [isAvatarPreviewOpen, setIsAvatarPreviewOpen] = useState(false);
  const [isRemoveAvatarDialogOpen, setIsRemoveAvatarDialogOpen] = useState(false);
  const avatarMenuRef = useRef(null);
  const avatarInputRef = useRef(null);

  // Same click-outside-to-close pattern as NotificationBell.
  useEffect(() => {
    if (!isAvatarMenuOpen) return undefined;
    const handleClickOutside = (event) => {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(event.target)) setIsAvatarMenuOpen(false);
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setIsAvatarMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isAvatarMenuOpen]);

  useLayoutEffect(() => {
    const content = document.querySelector('.profile-page')?.closest('.main-content');
    content?.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setAvatarError('Please choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Profile photos must be 5 MB or smaller.');
      return;
    }
    setAvatarError('');
    setIsAvatarMenuOpen(false);
    setAvatarFile(file);
    setAvatarPreviewUrl(URL.createObjectURL(file));
    setIsAvatarPreviewOpen(true);
  };

  const closeAvatarPreview = () => {
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    setAvatarPreviewUrl('');
    setAvatarFile(null);
    setIsAvatarPreviewOpen(false);
  };

  const handleAvatarSave = async () => {
    if (!avatarFile) return;
    setIsUploadingAvatar(true);
    setAvatarError('');
    try {
      const avatarUrl = await uploadAvatar(avatarFile, currentUser.id);
      await updateUserProfile(currentUser.id, { avatarUrl });
      await refreshUser();
      closeAvatarPreview();
    } catch (error) {
      console.error('Avatar upload failed:', error);
      setAvatarError('Could not upload photo right now. Please try again later.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setIsRemoveAvatarDialogOpen(false);
    setIsAvatarMenuOpen(false);
    setAvatarError('');
    setIsUploadingAvatar(true);
    try {
      await updateUserProfile(currentUser.id, { avatarUrl: null });
      await refreshUser();
    } catch (error) {
      console.error('Avatar removal failed:', error);
      setAvatarError('Could not remove photo right now. Please try again later.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // GCash payment info (farmer-only) uses a view-then-edit flow; QR uploads remain independent.
  const [gcashDraft, setGcashDraft] = useState({
    gcashAccountName: currentUser.gcashAccountName || '',
    gcashNumber: currentUser.gcashNumber || '',
  });
  const [gcashErrors, setGcashErrors] = useState({});
  const [gcashNotice, setGcashNotice] = useState('');
  const [isSavingGcash, setIsSavingGcash] = useState(false);
  const [isEditingGcash, setIsEditingGcash] = useState(
    !currentUser.gcashAccountName && !currentUser.gcashNumber,
  );
  const [isUploadingQr, setIsUploadingQr] = useState(false);
  const [qrError, setQrError] = useState('');

  // The account-name/number form and the QR upload save independently (see handleQrChange —
  // it persists itself the moment a file is picked, same as the avatar photo) — a farmer can
  // easily upload just the QR and think they're done, since nothing else on this page says
  // otherwise. The backend requires BOTH before a buyer can pay this farmer via GCash (see
  // getGcashCheckout in payments.controller.js) — this banner is what actually tells the
  // farmer which half is still missing, instead of only surfacing as a buyer-side error later.
  const hasGcashAccountName = Boolean(currentUser.gcashAccountName);
  const hasGcashQr = Boolean(currentUser.gcashQrUrl);
  const isGcashSetupComplete = hasGcashAccountName && hasGcashQr;

  const updateGcashField = (field, value) => {
    setGcashDraft((previous) => ({ ...previous, [field]: value }));
    setGcashErrors((previous) => ({ ...previous, [field]: undefined }));
    setGcashNotice('');
  };

  const handleGcashSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validateGcashForm(gcashDraft);
    if (hasErrors(nextErrors)) {
      setGcashErrors(nextErrors);
      return;
    }
    setIsSavingGcash(true);
    try {
      const updatedProfile = await updateUserProfile(currentUser.id, gcashDraft);
      // The API returns the persisted profile (including the backend's trimmed values). Keep
      // the form in sync immediately, then refresh the shared auth profile so every header,
      // checkout, and payment surface sees the update without a reload.
      setGcashDraft({
        gcashAccountName: updatedProfile?.gcashAccountName ?? gcashDraft.gcashAccountName.trim(),
        gcashNumber: updatedProfile?.gcashNumber ?? gcashDraft.gcashNumber.trim(),
      });
      setGcashErrors({});
      await refreshUser();
      setGcashNotice('Payment information updated.');
      setIsEditingGcash(false);
    } catch (error) {
      setGcashErrors({ gcashAccountName: error.message });
    } finally {
      setIsSavingGcash(false);
    }
  };

  const handleQrChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setQrError('Please choose an image file.');
      return;
    }
    setQrError('');
    setIsUploadingQr(true);
    try {
      const gcashQrUrl = await uploadPaymentQr(file, currentUser.id);
      await updateUserProfile(currentUser.id, { gcashQrUrl });
      await refreshUser();
    } catch (error) {
      console.error('QR upload failed:', error);
      setQrError('Could not upload QR code right now. Please try again later.');
    } finally {
      setIsUploadingQr(false);
    }
  };

  const updateProfileField = (field, value) => {
    setProfileDraft((previous) => ({ ...previous, [field]: value }));
    setProfileErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const startEditing = () => {
    setProfileDraft(buildProfileDraft(currentUser));
    setProfileErrors({});
    setProfileNotice('');
    setIsEditing(true);
  };

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validateProfileForm(profileDraft, currentUser.role);
    if (hasErrors(nextErrors)) {
      setProfileErrors(nextErrors);
      return;
    }
    try {
      const payload = profileDraft.organizationType === 'Other'
        ? { ...profileDraft, organizationType: profileDraft.organizationTypeOther.trim() }
        : profileDraft;
      const updatedProfile = await updateUserProfile(currentUser.id, payload);
      // Use the persisted response (the backend trims/normalizes values) so the form and the
      // rest of the page immediately show exactly what was saved, without a manual reload.
      setProfileDraft(buildProfileDraft(updatedProfile || profileDraft));
      await refreshUser();
      setIsEditing(false);
      setProfileNotice('Profile updated.');
    } catch (error) {
      setProfileErrors({ name: error.message });
    }
  };

  const updatePasswordField = (field, value) => {
    setPasswordDraft((previous) => ({ ...previous, [field]: value }));
    setPasswordErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const startChangingPassword = () => {
    setPasswordDraft(EMPTY_PASSWORD_DRAFT);
    setPasswordErrors({});
    setPasswordNotice('');
    setIsChangingPassword(true);
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validatePasswordForm(passwordDraft);
    if (hasErrors(nextErrors)) {
      setPasswordErrors(nextErrors);
      return;
    }
    try {
      await changePassword(currentUser.id, passwordDraft.currentPassword, passwordDraft.newPassword);
      setIsChangingPassword(false);
      setPasswordDraft(EMPTY_PASSWORD_DRAFT);
      setPasswordNotice('Password changed.');
    } catch (error) {
      setPasswordErrors({ currentPassword: error.message });
    }
  };

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title="My profile"
      subtitle="Your account details on HarvestLink."
      headerActions={!isEditing ? (
        <Button
          variant="secondary"
          onClick={startEditing}
          className="profile-page-header-edit"
        >
          <Edit3 size={15} /> Edit Profile
        </Button>
      ) : null}
      pageClassName="profile-page"
    >
      <section className="panel profile-header">
        <div className="profile-identity">
          <div className="profile-identity-main">
            <div className="profile-avatar-block">
              <button
                type="button"
                className="profile-avatar-lg"
                aria-label="Change profile photo"
                title="Change profile photo"
                onClick={() => setIsAvatarMenuOpen((previous) => !previous)}
                disabled={isUploadingAvatar}
              >
                {currentUser.avatarUrl ? <img src={currentUser.avatarUrl} alt={`${currentUser.name}'s profile`} /> : getInitials(currentUser.name)}
                <span className="profile-avatar-camera" aria-hidden="true"><Camera size={15} /></span>
              </button>
              <div className="profile-avatar-menu-wrap" ref={avatarMenuRef}>
                {isAvatarMenuOpen ? (
                  <div className="profile-avatar-menu">
                    <button type="button" className="profile-avatar-menu-item" onClick={() => avatarInputRef.current?.click()}>
                      <ImagePlus size={15} /> Change photo
                    </button>
                    {currentUser.avatarUrl ? (
                      <button
                        type="button"
                        className="profile-avatar-menu-item danger"
                        disabled={isUploadingAvatar}
                        onClick={() => setIsRemoveAvatarDialogOpen(true)}
                      >
                        <Trash2 size={15} /> Remove photo
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="profile-avatar-file-input"
                  disabled={isUploadingAvatar}
                  onChange={handleAvatarChange}
                />
              </div>
            </div>
            <div className="profile-identity-text">
              <h2>{currentUser.name}</h2>
              <div className="profile-contact-row">
                <span className="profile-email"><Mail size={14} /> {currentUser.email}</span>
                <span className="profile-account-type">
                  <BadgeCheck size={14} />
                  {currentUser.verificationStatus === 'verified' ? 'Verified ' : ''}
                  {currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)}
                </span>
              </div>
              {isUploadingAvatar ? <span className="profile-avatar-status">Saving…</span> : null}
              {avatarError ? <span className="profile-avatar-status error">{avatarError}</span> : null}
            </div>
          </div>
          {!isEditing ? (
            <Button variant="secondary" onClick={startEditing} className="profile-edit-btn">
              <Edit3 size={15} /> Edit Profile
            </Button>
          ) : null}
        </div>

        <div className="profile-summary-row">
          <div className="profile-summary-item">
            <span className={`profile-summary-icon${isAccountVerified ? ' status-verified' : ''}`}>
              <ShieldCheck size={16} />
            </span>
            <div>
              <small>Account status</small>
              <strong>{currentUser.verificationStatus ? currentUser.verificationStatus : 'Active'}</strong>
            </div>
          </div>
          <div className="profile-summary-item">
            <span className="profile-summary-icon"><UserSquare size={16} /></span>
            <div>
              <small>Role</small>
              <strong>{currentUser.role}</strong>
            </div>
          </div>
          <div className="profile-summary-item">
            <span className="profile-summary-icon"><MapPin size={16} /></span>
            <div>
              <small>Location</small>
              <strong>{currentUser.municipality || 'Not provided'}</strong>
            </div>
          </div>
          <div className="profile-summary-item">
            <span className="profile-summary-icon"><Calendar size={16} /></span>
            <div>
              <small>Member since</small>
              <strong>{formatDate(currentUser.createdAt)}</strong>
            </div>
          </div>
        </div>
      </section>
      <ConfirmDialog
        open={isRemoveAvatarDialogOpen}
        title="Remove profile photo?"
        message="Your current profile photo will be removed and your initials will be shown instead."
        confirmLabel="Remove photo"
        onConfirm={handleRemoveAvatar}
        onCancel={() => setIsRemoveAvatarDialogOpen(false)}
      />
      {isAvatarPreviewOpen ? (
        <div className="profile-avatar-preview-backdrop" role="presentation" onClick={closeAvatarPreview}>
          <div className="profile-avatar-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-photo-preview-title" onClick={(event) => event.stopPropagation()}>
            <div className="profile-avatar-preview-heading">
              <h2 id="profile-photo-preview-title">Profile photo</h2>
              <button type="button" aria-label="Close preview" onClick={closeAvatarPreview}><X size={18} /></button>
            </div>
            <img src={avatarPreviewUrl} alt="Selected profile preview" className="profile-avatar-preview-image" />
            {avatarError ? <p className="profile-avatar-status error">{avatarError}</p> : null}
            <div className="profile-avatar-preview-actions">
              <Button variant="secondary" onClick={closeAvatarPreview} disabled={isUploadingAvatar}>Cancel</Button>
              <Button onClick={handleAvatarSave} disabled={isUploadingAvatar}>
                {isUploadingAvatar ? 'Uploading…' : 'Save photo'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="content-grid two">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Personal</p>
              <h2>Personal information</h2>
            </div>
            {!isEditing ? (
              <Button size="sm" variant="secondary" onClick={startEditing}>
                <Edit3 size={15} /> Edit
              </Button>
            ) : null}
          </div>

          {profileNotice ? <div className="form-alert success">{profileNotice}</div> : null}

          {isEditing ? (
            <form className="form-stack" onSubmit={handleProfileSubmit}>
              <FormField label="Full name" name="name" error={profileErrors.name}>
                <input id="name" value={profileDraft.name} onChange={(event) => updateProfileField('name', event.target.value)} />
              </FormField>

              {isStakeholder ? (
                <>
                  <FormField label="Organization name" name="organizationName" error={profileErrors.organizationName}>
                    <input id="organizationName" value={profileDraft.organizationName} onChange={(event) => updateProfileField('organizationName', event.target.value)} />
                  </FormField>
                  <div className="form-grid">
                    <FormField label="Organization type" name="organizationType" error={profileErrors.organizationType}>
                      <select id="organizationType" value={profileDraft.organizationType} onChange={(event) => updateProfileField('organizationType', event.target.value)}>
                        {ORGANIZATION_TYPES.map((type) => <option key={type}>{type}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Contact person" name="contactPerson" error={profileErrors.contactPerson}>
                      <input id="contactPerson" value={profileDraft.contactPerson} onChange={(event) => updateProfileField('contactPerson', event.target.value)} />
                    </FormField>
                  </div>
                  {profileDraft.organizationType === 'Other' ? (
                    <FormField label="Specify organization type" name="organizationTypeOther" error={profileErrors.organizationType}>
                      <input
                        id="organizationTypeOther"
                        value={profileDraft.organizationTypeOther}
                        onChange={(event) => updateProfileField('organizationTypeOther', event.target.value)}
                        placeholder="e.g. Community Kitchen"
                      />
                    </FormField>
                  ) : null}
                  <FormField label="Contact number" name="contactNumber" error={profileErrors.contactNumber}>
                    <input id="contactNumber" value={profileDraft.contactNumber} onChange={(event) => updateProfileField('contactNumber', event.target.value)} />
                  </FormField>
                </>
              ) : (
                <FormField label="Contact number" name="contactNumber" error={profileErrors.contactNumber}>
                  <input id="contactNumber" value={profileDraft.contactNumber} onChange={(event) => updateProfileField('contactNumber', event.target.value)} />
                </FormField>
              )}

              {isFarmer ? (
                <FormField label="Birthday" name="birthday" error={profileErrors.birthday}>
                  <input id="birthday" type="date" value={profileDraft.birthday} onChange={(event) => updateProfileField('birthday', event.target.value)} />
                </FormField>
              ) : null}

              <FormField label={isFarmer ? 'Farm location' : 'Location'} name="municipality" error={profileErrors.municipality}>
                <select id="municipality" value={profileDraft.municipality} onChange={(event) => updateProfileField('municipality', event.target.value)}>
                  {CEBU_MUNICIPALITIES.map((municipality) => <option key={municipality}>{municipality}</option>)}
                </select>
              </FormField>

              {isFarmer ? (
                <FormField label="Farm name" name="farmName" error={profileErrors.farmName}>
                  <input id="farmName" value={profileDraft.farmName} onChange={(event) => updateProfileField('farmName', event.target.value)} />
                </FormField>
              ) : null}

              <div className="form-grid address-row">
                <FormField label="Complete address" name="address" error={profileErrors.address}>
                  <AddressAutocomplete
                    id="address"
                    value={profileDraft.address}
                    onChange={(next) => updateProfileField('address', next)}
                    onSelect={(details) => { if (details.zipCode) updateProfileField('zipCode', details.zipCode); }}
                    error={profileErrors.address}
                    placeholder="House/Unit No., Street, Barangay"
                  />
                </FormField>
                <FormField label="Zip code" name="zipCode" error={profileErrors.zipCode}>
                  <input
                    id="zipCode"
                    value={profileDraft.zipCode}
                    onChange={(event) => updateProfileField('zipCode', event.target.value)}
                    placeholder="6000"
                    inputMode="numeric"
                    maxLength={4}
                  />
                </FormField>
              </div>

              <div className="form-actions">
                <Button type="button" variant="secondary" onClick={() => setIsEditing(false)}>Cancel</Button>
                <Button type="submit">Save changes</Button>
              </div>
            </form>
          ) : (
            <div className="info-grid">
              <InfoRow icon={Mail} label="Email address" value={currentUser.email} />
              {isStakeholder ? (
                <InfoRow icon={UserSquare} label="Contact person" value={currentUser.contactPerson} />
              ) : null}
              <InfoRow icon={Phone} label="Contact number" value={currentUser.contactNumber} />
              {isFarmer ? (
                <InfoRow icon={Calendar} label="Birthday" value={currentUser.birthday ? formatDate(currentUser.birthday) : ''} />
              ) : (
                <InfoRow icon={MapPin} label="Location" value={currentUser.municipality} />
              )}
              <InfoRow icon={MapPin} label="Complete address" value={currentUser.address} />
              <InfoRow icon={MapPin} label="Zip code" value={currentUser.zipCode} />
              <InfoRow icon={Calendar} label="Member since" value={formatDate(currentUser.createdAt)} />
            </div>
          )}
        </div>

        <div className="panel">
          {isFarmer ? (
            <>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Farm</p>
                  <h2>Farm details</h2>
                </div>
              </div>
              <div className="info-grid">
                <InfoRow icon={Store} label="Farm name" value={currentUser.farmName} />
                <InfoRow icon={MapPin} label="Farm location" value={currentUser.municipality} />
              </div>
              <FilePreviewCard
                label="Proof of certification / government ID"
                file={currentUser.govIdFile}
                resolveUrl={() => getSignedDocumentUrl(currentUser.govIdFile)}
              />
            </>
          ) : isStakeholder ? (
            <>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Organization</p>
                  <h2>Organization details</h2>
                </div>
              </div>
              <div className="info-grid">
                <InfoRow icon={Building2} label="Organization name" value={currentUser.organizationName} />
                <InfoRow icon={ShieldCheck} label="Organization type" value={currentUser.organizationType} />
                <InfoRow icon={MapPin} label="Location" value={currentUser.municipality} />
              </div>
              <FilePreviewCard
                label="Proof of accreditation"
                file={currentUser.accreditationFile}
                resolveUrl={() => getSignedDocumentUrl(currentUser.accreditationFile)}
              />
            </>
          ) : (
            <>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Trust & safety</p>
                  <h2>Verification</h2>
                </div>
              </div>
              <ul className="verification-checklist">
                <li className={currentUser.contactNumber ? 'done' : ''}>
                  {currentUser.contactNumber ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                  Contact verified
                </li>
                <li className={currentUser.municipality ? 'done' : ''}>
                  {currentUser.municipality ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                  Delivery address verified
                </li>
                <li className={currentUser.accountStatus === 'active' ? 'done' : ''}>
                  {currentUser.accountStatus === 'active' ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                  Buyer account active
                </li>
              </ul>
            </>
          )}
        </div>
      </section>

      {isFarmer ? (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Payments</p>
              <h2>Payment Information</h2>
            </div>
          </div>
          <p className="muted gcash-intro">Configure how buyers can send GCash payments directly to your account.</p>

          {isGcashSetupComplete ? (
            <div className="gcash-status success">
              <CheckCircle2 size={16} />
              <div>
                <strong>GCash payments active</strong>
                <span>Buyers can pay using the payment details below.</span>
              </div>
            </div>
          ) : (
            <div className="gcash-status warning">
              <CircleAlert size={16} />
              <div>
                <strong>GCash payments not active yet</strong>
                <span>
                  Add
                  {!hasGcashAccountName && !hasGcashQr ? ' your account name and QR code' : !hasGcashAccountName ? ' your account name' : ' your QR code'}
                  {' '}to accept buyer payments.
                </span>
              </div>
            </div>
          )}

          {gcashNotice ? <div className="form-alert success">{gcashNotice}</div> : null}

          <div className="gcash-settings-grid">
            {isEditingGcash ? (
              <form className="gcash-details-form" onSubmit={handleGcashSubmit}>
                <div className="gcash-subsection-heading">
                  <h3>Payment details</h3>
                  <p>Used to receive direct GCash payments from buyers.</p>
                </div>
                <FormField label="GCash Account Name" name="gcashAccountName" error={gcashErrors.gcashAccountName}>
                  <input
                    id="gcashAccountName"
                    value={gcashDraft.gcashAccountName}
                    onChange={(event) => updateGcashField('gcashAccountName', event.target.value)}
                    placeholder="Juan Dela Cruz"
                  />
                </FormField>
                <FormField label="GCash Mobile Number" name="gcashNumber" error={gcashErrors.gcashNumber}>
                  <input
                    id="gcashNumber"
                    value={gcashDraft.gcashNumber}
                    onChange={(event) => updateGcashField('gcashNumber', event.target.value)}
                    placeholder="09171234567"
                    inputMode="numeric"
                  />
                </FormField>
                <div className="form-actions gcash-form-actions">
                  <Button type="submit" disabled={isSavingGcash}>{isSavingGcash ? 'Saving…' : 'Save changes'}</Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isSavingGcash}
                    onClick={() => {
                      setGcashDraft({
                        gcashAccountName: currentUser.gcashAccountName || '',
                        gcashNumber: currentUser.gcashNumber || '',
                      });
                      setGcashErrors({});
                      setGcashNotice('');
                      if (currentUser.gcashAccountName || currentUser.gcashNumber) {
                        setIsEditingGcash(false);
                      }
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div className="gcash-details-form gcash-details-readonly">
                <div className="gcash-subsection-heading">
                  <h3>Payment details</h3>
                  <p>These details are used to receive direct GCash payments from buyers.</p>
                </div>
                <dl className="gcash-details-list">
                  <div>
                    <dt>GCash Account Name</dt>
                    <dd>{currentUser.gcashAccountName}</dd>
                  </div>
                  <div>
                    <dt>GCash Mobile Number</dt>
                    <dd>{currentUser.gcashNumber}</dd>
                  </div>
                </dl>
                <Button
                  type="button"
                  variant="secondary"
                  className="gcash-edit-btn"
                  onClick={() => {
                    setGcashDraft({
                      gcashAccountName: currentUser.gcashAccountName || '',
                      gcashNumber: currentUser.gcashNumber || '',
                    });
                    setGcashNotice('');
                    setIsEditingGcash(true);
                  }}
                >
                  <Edit3 size={15} /> Edit payment details
                </Button>
              </div>
            )}

            <div className="gcash-qr-section">
              <div className="gcash-subsection-heading">
                <h3>GCash QR code</h3>
                <p>Buyers can scan this code when paying through GCash.</p>
              </div>
              {currentUser.gcashQrUrl ? (
                <div className="gcash-qr-preview">
                  <ZoomableImage src={currentUser.gcashQrUrl} alt="GCash payment QR code" />
                </div>
              ) : (
                <div className="gcash-qr-preview empty">
                  <QrCode size={26} />
                  <span>No QR code uploaded</span>
                </div>
              )}
              <span className={`gcash-qr-status${currentUser.gcashQrUrl ? ' uploaded' : ''}`}>
                {currentUser.gcashQrUrl ? <><CheckCircle2 size={14} /> QR code uploaded</> : 'Upload your official GCash QR code to let buyers scan and pay.'}
              </span>
              {qrError ? <small className="field-error">{qrError}</small> : null}
              <label className="btn btn-secondary btn-md gcash-qr-upload-btn">
                <input type="file" accept="image/*" disabled={isUploadingQr} onChange={handleQrChange} />
                {isUploadingQr ? 'Uploading…' : currentUser.gcashQrUrl ? 'Replace QR code' : 'Upload QR code'}
              </label>
              <small className="gcash-qr-note">Only upload the official QR code for the GCash account shown here.</small>
            </div>
          </div>
        </section>
      ) : null}

      <section className="panel security-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Security</p>
            <h2><span className="security-lock-icon"><Lock size={16} /></span> Password</h2>
          </div>
          {!isChangingPassword ? (
            <Button size="sm" variant="secondary" onClick={startChangingPassword}>
              <Lock size={15} /> Change password
            </Button>
          ) : null}
        </div>

        {passwordNotice ? <div className="form-alert success">{passwordNotice}</div> : null}

        {isChangingPassword ? (
          <form className="form-stack" onSubmit={handlePasswordSubmit}>
            <FormField label="Current password" name="currentPassword" error={passwordErrors.currentPassword}>
              <input
                id="currentPassword"
                type="password"
                value={passwordDraft.currentPassword}
                onChange={(event) => updatePasswordField('currentPassword', event.target.value)}
              />
            </FormField>
            <FormField label="New password" name="newPassword" error={passwordErrors.newPassword}>
              <input
                id="newPassword"
                type="password"
                value={passwordDraft.newPassword}
                onChange={(event) => updatePasswordField('newPassword', event.target.value)}
              />
            </FormField>
            <FormField label="Confirm new password" name="confirmPassword" error={passwordErrors.confirmPassword}>
              <input
                id="confirmPassword"
                type="password"
                value={passwordDraft.confirmPassword}
                onChange={(event) => updatePasswordField('confirmPassword', event.target.value)}
              />
            </FormField>
            <div className="form-actions">
              <Button type="button" variant="secondary" onClick={() => setIsChangingPassword(false)}>Cancel</Button>
              <Button type="submit">Update password</Button>
            </div>
          </form>
        ) : (
          <p className="muted">Keep your account secure by using a password you don't use elsewhere.</p>
        )}
      </section>

    </AppShell>
  );
}
