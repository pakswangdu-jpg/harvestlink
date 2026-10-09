import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Ban, Check, CircleCheck, RotateCcw, Search, X } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import PageHeader from '../../components/admin/PageHeader';
import Table from '../../components/admin/Table';
import Modal from '../../components/admin/Modal';
import Pagination from '../../components/admin/Pagination';
import Button from '../../components/admin/Button';
import DocumentCard from '../../components/admin/DocumentCard';
import { useAuth } from '../auth/AuthContext';
import { getAdminUserPage, getAdminUserDetails, getVerificationDocuments, setAccountStatus, setUserVerification } from '../../services/authService';
import { formatDate, formatTime } from '../../utils/formatters';
import { adminNavItems } from './adminNav';
import './AdminUsers.css';

const BASE = { page: 1, role: '', verificationStatus: '', accountStatus: '', search: '', from: '', to: '' };
const TABS = [['all','All'],['farmer','Farmers'],['buyer','Buyers'],['stakeholder','Stakeholders'],['pending','Pending verification']];
const verificationLabel = (user) => ['buyer','admin'].includes(user.role) ? 'Not required' : ({ pending: 'Pending verification', verified: 'Verified', rejected: 'Rejected' })[user.verificationStatus] || 'Not recorded';
const accountLabel = (user) => user.accountStatus === 'suspended' ? 'Deactivated' : 'Active';
const actionNotice = (action, name) => `${({ verified: 'Verification approved', rejected: 'Verification rejected', suspended: 'Account deactivated', active: 'Account reactivated' })[action]} for ${name}.`;
const stamp = (value) => value ? `${formatDate(value)}, ${formatTime(value)}` : 'Not recorded';
const ACTIONS = {
  verified: ['Verify this account?', 'This user will receive verified marketplace privileges for their role.', 'Verify account'],
  rejected: ['Reject verification?', 'The account and transaction history will remain available.', 'Reject verification'],
  suspended: ['Deactivate this account?', 'This user will no longer be able to use normal HarvestLink marketplace features. Existing orders and account history will remain available.', 'Deactivate account'],
  active: ['Reactivate this account?', 'The original account will be restored to Active. Existing verification and transaction history will remain unchanged.', 'Reactivate account'],
};
const eventLabel = (value) => ({ USER_VERIFIED: 'Account verified', USER_VERIFICATION_REJECTED: 'Verification rejected', USER_DEACTIVATED: 'Account deactivated', USER_REACTIVATED: 'Account reactivated' })[value] || value;
function Fields({ values }) { return <dl className="admin-user-fields">{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? 'Not recorded'}</dd></div>)}</dl>; }

function UserDetails({ id, adminId, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState('Incomplete information');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const dialog = useRef(null);
  const submitting = useRef(false);
  useEffect(() => {
    let cancelled = false;
    getAdminUserDetails(id, historyPage).then((result) => { if (!cancelled) { setData(result); setError(''); } }).catch((failure) => { if (!cancelled) setError(failure.message || 'Unable to load account details.'); });
    return () => { cancelled = true; };
  }, [id, historyPage, refresh]);
  useEffect(() => {
    if (action && !dialog.current.open) dialog.current.showModal();
    else if (!action && dialog.current.open) dialog.current.close();
  }, [action]);
  const user = data?.user;
  const accountManagementAvailable = data?.accountManagementAvailable !== false;
  const chooseAction = (value) => { if (!accountManagementAvailable) return; setActionError(''); setReason('Incomplete information'); setOther(''); setAction(value); };
  const submit = async (event) => {
    event.preventDefault();
    if (submitting.current || !accountManagementAvailable) return;
    submitting.current = true; setBusy(true); setActionError('');
    try {
      const updated = ['verified','rejected'].includes(action)
        ? await setUserVerification(user.id, action, action === 'rejected' ? reason === 'Other' ? `Other: ${other.trim()}` : reason : undefined, user.verificationStatus)
        : await setAccountStatus(user.id, action, user.accountStatus);
      setData((old) => ({ ...old, user: updated })); setAction(null); setHistoryPage(1); setRefresh((value) => value + 1);
      onChanged(actionNotice(action, user.name));
    } catch (failure) { setActionError(failure.message || 'Unable to update this account. Try again.'); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <Modal open onClose={() => { if (!submitting.current) { if (action) setAction(null); else onClose(); } }} className="admin-user-detail-modal" dialogLabel="User details" title={user?.name || 'User details'}>
    <div className="admin-user-details">
      {error ? <div className="form-alert error" role="alert">{error}<button type="button" onClick={() => setRefresh((value) => value + 1)}>Try again</button></div> : !user ? <p role="status">Loading account details...</p> : <>
        <section><h3>Account information</h3><Fields values={[
          ['Full name', user.name], ['Email', user.email], ['Role', user.role], ['Account status', accountLabel(user)],
          ['Verification status', verificationLabel(user)], ['Registered', stamp(user.createdAt)],
          ...(user.lastActiveAt ? [['Last active', stamp(user.lastActiveAt)]] : []),
        ]} /></section>
        <section><h3>{user.role === 'farmer' ? 'Farmer information' : user.role === 'stakeholder' ? 'Organization information' : user.role === 'buyer' ? 'Buyer information' : 'Admin information'}</h3><Fields values={[
          ...(user.role === 'farmer' ? [['Farm name', user.farmName]] : []),
          ...(user.role === 'stakeholder' ? [['Organization name', user.organizationName], ['Organization type', user.organizationType], ['Contact name', user.contactPerson], ['Organization description', user.organizationDescription], ['Partnership description', user.partnershipDescription]] : []),
          ['Location', user.municipality],
          ...(['farmer','stakeholder'].includes(user.role) ? [['Address', user.address], ['Contact number', user.contactNumber], ['Verification', verificationLabel(user)], ...(user.verificationStatus === 'verified' && user.verifiedAt ? [['Verified', stamp(user.verifiedAt)]] : []), ...(user.verificationRejectionReason ? [['Rejection reason', user.verificationRejectionReason]] : [])] : []),
          ...Object.entries(data.activity || {}).map(([label, count]) => [label, count === null ? 'Unavailable' : count]),
        ]} /></section>
        {['farmer','stakeholder'].includes(user.role) ? <section><h3>Verification document</h3><DocumentCard label={user.role === 'farmer' ? 'Proof of certification / government ID' : 'Proof of accreditation'} file={user.role === 'farmer' ? user.govIdFile : user.accreditationFile} resolveUrl={async () => { const urls = await getVerificationDocuments(user.id); return user.role === 'farmer' ? urls.govIdFile : urls.accreditationFile; }} /></section> : null}
        {['farmer','stakeholder'].includes(user.role) && ['pending','rejected'].includes(user.verificationStatus) ? <section><h3>Verification review</h3><div className="admin-user-actions"><Button disabled={!accountManagementAvailable} onClick={() => chooseAction('verified')}><Check size={14} /> Verify account</Button>{user.verificationStatus === 'pending' ? <Button variant="danger" disabled={!accountManagementAvailable} onClick={() => chooseAction('rejected')}><X size={14} /> Reject</Button> : null}</div></section> : null}
        <section><h3>Account actions</h3>{!accountManagementAvailable ? <p className="admin-user-secondary">Account changes are unavailable until account history is configured.</p> : null}{user.id === adminId ? <p className="admin-user-secondary">Your current admin account cannot be deactivated here.</p> : <Button disabled={!accountManagementAvailable} variant={user.accountStatus === 'suspended' ? 'primary' : 'danger'} onClick={() => chooseAction(user.accountStatus === 'suspended' ? 'active' : 'suspended')}>{user.accountStatus === 'suspended' ? <RotateCcw size={14} /> : <Ban size={14} />}{user.accountStatus === 'suspended' ? 'Reactivate account' : 'Deactivate account'}</Button>}</section>
        <section><h3>Account history</h3><ol className="admin-user-history"><li><strong>Registered</strong><time>{stamp(user.createdAt)}</time></li>{data.history.map((entry) => <li key={entry.id}><strong>{eventLabel(entry.action)}</strong><time>{stamp(entry.occurred_at)}</time><span>Admin ID: {entry.admin_id}</span>{entry.reason ? <p>{entry.reason}</p> : null}</li>)}</ol>{data.historyAvailable === false ? <p className="form-alert warning" role="status">Account history is not configured. Apply the admin account history migration to enable audited account changes.</p> : !data.history.length ? <p className="admin-user-secondary">No recorded admin actions. Earlier account changes were not historically logged.</p> : null}{data.historyAvailable !== false ? <Pagination page={historyPage} pageSize={10} total={data.historyTotal} onPageChange={setHistoryPage} /> : null}</section>
      </>}
      <dialog ref={dialog} className="admin-user-confirm" aria-labelledby="admin-user-confirm-title" onCancel={(event) => { event.preventDefault(); if (!submitting.current) setAction(null); }}>
        <form onSubmit={submit}><h3 id="admin-user-confirm-title">{action ? ACTIONS[action][0] : ''}</h3><p>{action ? ACTIONS[action][1] : ''}</p>
          {action === 'rejected' ? <><label>Reason<select value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)}>{['Incomplete information','Invalid information','Unable to verify','Other'].map((value) => <option key={value}>{value}</option>)}</select></label>{reason === 'Other' ? <label>Details<textarea value={other} required maxLength={480} disabled={busy} onChange={(event) => setOther(event.target.value)} /></label> : null}</> : null}
          {actionError ? <p className="form-alert error" role="alert">{actionError}</p> : null}
          <div className="admin-user-actions"><Button type="button" variant="secondary" disabled={busy} onClick={() => setAction(null)}>Cancel</Button><Button type="submit" variant={['rejected','suspended'].includes(action) ? 'danger' : 'primary'} disabled={busy || action === 'rejected' && reason === 'Other' && !other.trim()}>{busy ? 'Updating...' : action ? ACTIONS[action][2] : 'Confirm'}</Button></div>
        </form>
      </dialog>
    </div>
  </Modal>;
}

export default function AdminUsers() {
  const { currentUser } = useAuth();
  const [filters, setFilters] = useState(BASE);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => { getAdminUserPage(filters).then((data) => {
      if (cancelled) return;
      const last = Math.max(1, Math.ceil(data.total / 10));
      if (filters.page > last) setFilters((old) => ({ ...old, page: last }));
      else { setResult(data); setError(''); }
    }).catch((failure) => { if (!cancelled) setError(failure.message || 'Unable to load users. Try again.'); }).finally(() => { if (!cancelled) setLoading(false); }); }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [filters, refresh]);
  const change = (key, value) => { setLoading(true); setFilters((old) => ({ ...old, [key]: value, page: 1 })); };
  const hasFilters = Object.entries(filters).some(([key, value]) => key !== 'page' && Boolean(value));
  const empty = filters.verificationStatus === 'pending' && !filters.search ? 'No accounts waiting for verification' : hasFilters ? 'No users match these filters' : 'No users found';
  return <AppShell user={currentUser} navItems={adminNavItems} title="Users" hideHeader><div className="admin-users-page">
    <PageHeader title="Users" description="Registered farmer, buyer, and stakeholder accounts." />
    <nav className="admin-user-tabs" aria-label="User categories">{TABS.map(([key,label]) => <button type="button" key={key} aria-pressed={key === 'pending' ? filters.verificationStatus === 'pending' : key === 'all' ? !filters.role && !filters.verificationStatus : filters.role === key} onClick={() => { setLoading(true); setFilters({ ...BASE, role: ['all','pending'].includes(key) ? '' : key, verificationStatus: key === 'pending' ? 'pending' : '' }); }}>{label}<span>{result?.counts?.[key] ?? '--'}</span></button>)}</nav>
    <div className="admin-user-toolbar">
      <label className="admin-user-search"><span>Search users</span><div><Search size={16} /><input type="search" maxLength={120} placeholder="Name, email, farm or organization" value={filters.search} onChange={(event) => change('search', event.target.value)} /></div></label>
      {[
        ['role','Role',[['farmer','Farmer'],['buyer','Buyer'],['stakeholder','Stakeholder'],['admin','Admin']]],
        ['verificationStatus','Verification',[['not_required','Not required'],['pending','Pending verification'],['verified','Verified'],['rejected','Rejected']]],
        ['accountStatus','Account status',[['active','Active'],['suspended','Deactivated']]],
      ].map(([key,label,options]) => <label key={key}><span>{label}</span><select value={filters[key]} onChange={(event) => change(key,event.target.value)}><option value="">All</option>{options.map(([value,text]) => <option key={value} value={value}>{text}</option>)}</select></label>)}
      <label><span>Joined from</span><input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => change('from',event.target.value)} /></label><label><span>Joined to</span><input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => change('to',event.target.value)} /></label>
    </div>
    {notice ? <div className="admin-user-action-notice">
      <div role="status" aria-live="polite" aria-atomic="true"><CircleCheck size={18} aria-hidden="true" /><span>{notice}</span></div>
      <button type="button" aria-label="Dismiss notification" title="Dismiss notification" onClick={() => setNotice('')}><X size={16} aria-hidden="true" /></button>
    </div> : null}
    {error ? <div className="form-alert error" role="alert">{error}<button type="button" onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}>Try again</button></div> : null}
    {loading ? <p role="status">Loading users...</p> : null}
    {result && !loading && !error ? <><div className="admin-user-table"><Table columns={[
      { key:'name',label:'Name',render:(user) => <strong>{user.name}</strong> }, { key:'email',label:'Email' }, { key:'role',label:'Role' },
      { key:'verificationStatus',label:'Verification',render:(user) => <span className={`admin-user-state is-${user.verificationStatus}`}>{verificationLabel(user)}</span> },
      { key:'accountStatus',label:'Account',render:(user) => <span className={user.accountStatus === 'suspended' ? 'admin-user-deactivated' : ''}>{accountLabel(user)}</span> },
      { key:'createdAt',label:'Created',render:(user) => formatDate(user.createdAt) },
      { key:'action',label:'Action',render:(user) => <button className="admin-user-link" type="button" onClick={() => setSelectedId(user.id)} aria-label={`View details for ${user.name}`}>View details <ArrowRight size={14} /></button> },
    ]} rows={result.users} emptyMessage={empty} /></div><Pagination page={filters.page} pageSize={10} total={result.total} onPageChange={(page) => { setLoading(true); setFilters((old) => ({ ...old,page })); }} /></> : null}
    {selectedId ? <UserDetails key={selectedId} id={selectedId} adminId={currentUser.id} onClose={() => setSelectedId(null)} onChanged={(message) => { setNotice(message); setLoading(true); setRefresh((value) => value + 1); }} /> : null}
  </div></AppShell>;
}
