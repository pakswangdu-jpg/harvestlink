import { useRef, useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import PageHeader from '../../components/admin/PageHeader';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import FormAlert from '../../components/common/FormAlert';
import { useAuth } from '../auth/AuthContext';
import { changePassword } from '../../services/authService';
import { formatDate, getInitials } from '../../utils/formatters';
import { hasErrors, validatePasswordForm } from '../../utils/validators';
import { adminNavItems } from './adminNav';
import './AdminProfile.css';

const EMPTY_PASSWORD = { currentPassword: '', newPassword: '', confirmPassword: '' };

export default function AdminProfile() {
  const { currentUser: user } = useAuth();
  const [editingPassword, setEditingPassword] = useState(false);
  const [draft, setDraft] = useState(EMPTY_PASSWORD);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const accountStatus = user.accountStatus === 'active' ? 'Active'
    : user.accountStatus === 'suspended' ? 'Deactivated' : 'Not available';

  function startPasswordChange() {
    setDraft(EMPTY_PASSWORD);
    setErrors({});
    setNotice('');
    setEditingPassword(true);
  }

  async function submitPassword(event) {
    event.preventDefault();
    if (submitting.current) return;
    const nextErrors = validatePasswordForm(draft);
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;
    submitting.current = true;
    setSaving(true);
    try {
      await changePassword(user.id, draft.currentPassword, draft.newPassword);
      setDraft(EMPTY_PASSWORD);
      setEditingPassword(false);
      setNotice('Password changed.');
    } catch (error) {
      setErrors({ form: error.message || 'Unable to change your password. Please try again.' });
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <AppShell user={user} navItems={adminNavItems} title="Profile" hideHeader pageClassName="admin-profile-page">
      <div className="admin-profile-content">
      <PageHeader title="Profile" description="Your admin account details." />

      <section className="admin-profile-identity" aria-label="Admin account">
        <span className="admin-profile-avatar" aria-hidden="true">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : getInitials(user.name)}
        </span>
        <div>
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <p className="admin-profile-role">Administrator <span aria-hidden="true">/</span> <span className={user.accountStatus === 'active' ? 'admin-profile-active' : ''}>{accountStatus}</span></p>
        </div>
      </section>

      <section className="admin-profile-section" aria-labelledby="admin-account-heading">
        <h2 id="admin-account-heading">Account information</h2>
        <dl className="admin-profile-information">
          <div><dt>Email</dt><dd>{user.email}</dd></div>
          <div><dt>Role</dt><dd>Administrator</dd></div>
          <div><dt>Account status</dt><dd className={user.accountStatus === 'active' ? 'admin-profile-active' : ''}>{accountStatus}</dd></div>
          <div><dt>Member since</dt><dd>{formatDate(user.createdAt)}</dd></div>
        </dl>
      </section>

      <section className="admin-profile-section" aria-labelledby="admin-security-heading">
        <h2 id="admin-security-heading">Security &amp; access</h2>
        {notice ? <FormAlert type="success" message={notice} /> : null}
        <div className="admin-profile-security-row">
          <div><Lock size={16} aria-hidden="true" /><span>Password</span></div>
          {!editingPassword ? <Button size="sm" variant="secondary" onClick={startPasswordChange}><Lock size={15} aria-hidden="true" /> Change password</Button> : null}
        </div>
        {editingPassword ? <form className="admin-profile-password form-stack" onSubmit={submitPassword} aria-label="Change password" aria-busy={saving}>
          {errors.form ? <FormAlert type="error" message={errors.form} /> : null}
          {[
            ['currentPassword', 'Current password', 'current-password'],
            ['newPassword', 'New password', 'new-password'],
            ['confirmPassword', 'Confirm new password', 'new-password'],
          ].map(([key, label, autoComplete]) => <FormField key={key} label={label} name={`admin-${key}`} error={errors[key]}>
            <input id={`admin-${key}`} type="password" autoComplete={autoComplete} value={draft[key]} disabled={saving} onChange={(event) => setDraft((old) => ({ ...old, [key]: event.target.value }))} />
          </FormField>)}
          <div className="admin-profile-password-actions">
            <Button type="button" variant="secondary" disabled={saving} onClick={() => { setEditingPassword(false); setDraft(EMPTY_PASSWORD); setErrors({}); }}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Updating...' : 'Update password'}</Button>
          </div>
        </form> : null}
        <div className="admin-profile-security-row">
          <div><ShieldCheck size={16} aria-hidden="true" /><span>Admin network restriction</span></div>
          <span className="admin-profile-active">Enabled</span>
        </div>
      </section>
      </div>

    </AppShell>
  );
}
