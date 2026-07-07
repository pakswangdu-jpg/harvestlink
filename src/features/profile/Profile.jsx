import { useState } from 'react';
import { BadgeCheck, Building2, Calendar, Edit3, Lock, Mail, MapPin, Phone, ShieldCheck, Store, UserSquare } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import StatusBadge from '../../components/common/StatusBadge';
import InfoRow from '../../components/common/InfoRow';
import FilePreviewCard from '../../components/common/FilePreviewCard';
import { useAuth } from '../auth/AuthContext';
import { changePassword, updateUserProfile } from '../../services/authService';
import { CEBU_MUNICIPALITIES, ORGANIZATION_TYPES } from '../../utils/constants';
import { formatDate, getInitials } from '../../utils/formatters';
import { buildProfileDraft } from '../../utils/profileDraft';
import { hasErrors, validatePasswordForm, validateProfileForm } from '../../utils/validators';
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
  // Farmers and buyers can no longer self-edit these details — only an admin can, from
  // the Users section of the admin dashboard. Stakeholders keep self-service editing.
  const canEditProfile = isStakeholder;

  const [isEditing, setIsEditing] = useState(false);
  const [profileDraft, setProfileDraft] = useState(() => buildProfileDraft(currentUser));
  const [profileErrors, setProfileErrors] = useState({});
  const [profileNotice, setProfileNotice] = useState('');

  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState(EMPTY_PASSWORD_DRAFT);
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordNotice, setPasswordNotice] = useState('');

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

  const handleProfileSubmit = (event) => {
    event.preventDefault();
    const nextErrors = validateProfileForm(profileDraft, currentUser.role);
    if (hasErrors(nextErrors)) {
      setProfileErrors(nextErrors);
      return;
    }
    updateUserProfile(currentUser.id, profileDraft);
    refreshUser();
    setIsEditing(false);
    setProfileNotice('Profile updated.');
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

  const handlePasswordSubmit = (event) => {
    event.preventDefault();
    const nextErrors = validatePasswordForm(passwordDraft);
    if (hasErrors(nextErrors)) {
      setPasswordErrors(nextErrors);
      return;
    }
    try {
      changePassword(currentUser.id, passwordDraft.currentPassword, passwordDraft.newPassword);
      refreshUser();
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
    >
      <section className="panel profile-header">
        <div className="profile-banner" />
        <div className="profile-identity">
          <div className="profile-avatar-lg">{getInitials(currentUser.name)}</div>
          <div className="profile-identity-text">
            <h2>{currentUser.name}</h2>
            <span className="profile-email"><Mail size={14} /> {currentUser.email}</span>
          </div>
          <div className="profile-badges">
            <StatusBadge value={currentUser.role} />
            {currentUser.verificationStatus ? (
              <StatusBadge value={currentUser.verificationStatus} type="verification" />
            ) : (
              <span className="badge badge-active"><BadgeCheck size={13} /> Active account</span>
            )}
          </div>
        </div>
      </section>

      <section className="content-grid two">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Personal</p>
              <h2>Personal information</h2>
            </div>
            {canEditProfile && !isEditing ? (
              <Button size="sm" variant="secondary" onClick={startEditing}>
                <Edit3 size={15} /> Edit
              </Button>
            ) : null}
          </div>

          {!canEditProfile ? <p className="muted">Contact an admin to update these details.</p> : null}

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

              <div className="form-grid">
                <FormField label="Complete address" name="address" error={profileErrors.address}>
                  <input
                    id="address"
                    value={profileDraft.address}
                    onChange={(event) => updateProfileField('address', event.target.value)}
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
              ) : (
                <InfoRow icon={Phone} label="Contact number" value={currentUser.contactNumber} />
              )}
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
              <FilePreviewCard label="Proof of certification / government ID" file={currentUser.govIdFile} />
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
              <FilePreviewCard label="Proof of accreditation" file={currentUser.accreditationFile} />
            </>
          ) : (
            <>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Trust & safety</p>
                  <h2>Verification</h2>
                </div>
              </div>
              <div className="info-grid">
                <InfoRow icon={ShieldCheck} label="Account type" value="Individual buyer" />
                <InfoRow icon={Phone} label="Contact on file" value={currentUser.contactNumber ? 'Verified' : 'Not provided'} />
                <InfoRow icon={MapPin} label="Delivery area on file" value={currentUser.municipality ? 'Verified' : 'Not provided'} />
              </div>
            </>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Security</p>
            <h2>Password</h2>
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
