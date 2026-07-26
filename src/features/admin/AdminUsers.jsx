import { useEffect, useState } from 'react';
import {
  Ban, Building2, Calendar, Check, Mail, MapPin, Phone, RotateCcw, ShieldCheck, Store, UserSquare, X,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import PageHeader from '../../components/admin/PageHeader';
import { Card, CardHeader } from '../../components/admin/Card';
import Table from '../../components/admin/Table';
import Badge from '../../components/admin/Badge';
import Button from '../../components/admin/Button';
import Modal from '../../components/admin/Modal';
import Alert from '../../components/admin/Alert';
import DocumentCard from '../../components/admin/DocumentCard';
import LoadingState from '../../components/admin/LoadingState';
import Pagination from '../../components/admin/Pagination';
import { usePagination } from '../../components/admin/usePagination';
import { verificationTone, accountTone, verificationStatusLabel } from '../../components/admin/statusTone';
import { useAuth } from '../auth/AuthContext';
import { getUsers, getVerificationDocuments, setAccountStatus, setUserVerification } from '../../services/authService';
import { formatDate } from '../../utils/formatters';
import { adminNavItems } from './adminNav';

function InfoField({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-[#D0D7DE] bg-white p-3">
      <Icon size={16} className="mt-0.5 shrink-0 text-[#57606A]" />
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[#57606A]">{label}</p>
        <p className="break-words text-[13px] font-medium text-[#24292F]">{value || 'Not provided'}</p>
      </div>
    </div>
  );
}

function UserDetail({ user, onVerify, onToggleAccountStatus }) {
  const isFarmer = user.role === 'farmer';
  const isStakeholder = user.role === 'stakeholder';
  const isSuspended = user.accountStatus === 'suspended';
  const idFile = isFarmer ? user.govIdFile : isStakeholder ? user.accreditationFile : null;
  const idLabel = isFarmer ? 'Proof of certification / government ID' : 'Proof of accreditation';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge>{user.role}</Badge>
        <Badge tone={accountTone(user.accountStatus)}>{isSuspended ? 'Suspended' : 'Active'}</Badge>
        {user.verificationStatus ? <Badge tone={verificationTone(user.verificationStatus)}>{verificationStatusLabel(user.verificationStatus)}</Badge> : null}
      </div>

      <div>
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#57606A]">Personal information</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <InfoField icon={Mail} label="Email" value={user.email} />
          {user.contactNumber ? <InfoField icon={Phone} label="Contact number" value={user.contactNumber} /> : null}
          {user.municipality ? <InfoField icon={MapPin} label={isFarmer ? 'Farm location' : 'Location'} value={user.municipality} /> : null}
          <InfoField icon={Calendar} label="Member since" value={formatDate(user.createdAt)} />
          {isFarmer ? <InfoField icon={Store} label="Farm name" value={user.farmName} /> : null}
          {isFarmer && user.birthday ? <InfoField icon={Calendar} label="Birthday" value={formatDate(user.birthday)} /> : null}
          {isStakeholder ? <InfoField icon={Building2} label="Organization" value={user.organizationName} /> : null}
          {isStakeholder ? <InfoField icon={ShieldCheck} label="Organization type" value={user.organizationType} /> : null}
          {isStakeholder ? <InfoField icon={UserSquare} label="Contact person" value={user.contactPerson} /> : null}
          <InfoField icon={MapPin} label="Complete address" value={user.address} />
          <InfoField icon={MapPin} label="ZIP code" value={user.zipCode} />
        </div>
      </div>

      {isFarmer || isStakeholder ? (
        <div>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#57606A]">Verification document</p>
          <DocumentCard
            label={idLabel}
            file={idFile}
            resolveUrl={async () => {
              const urls = await getVerificationDocuments(user.id);
              return isFarmer ? urls.govIdFile : urls.accreditationFile;
            }}
          />
        </div>
      ) : null}

      {user.verificationStatus === 'pending' || user.verificationStatus === 'rejected' ? (
        <div>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#57606A]">Verification</p>
          <div className="flex flex-wrap gap-2">
            {user.verificationStatus === 'pending' ? (
              <>
                <Button variant="primary" onClick={() => onVerify(user, 'verified')}><Check size={14} /> Verify account</Button>
                <Button variant="danger" onClick={() => onVerify(user, 'rejected')}><X size={14} /> Reject</Button>
              </>
            ) : (
              <Button variant="primary" onClick={() => onVerify(user, 'verified')}><RotateCcw size={14} /> Reactivate verification</Button>
            )}
          </div>
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#57606A]">Account actions</p>
        {isSuspended ? (
          <Button variant="primary" onClick={() => onToggleAccountStatus(user, 'active')}><RotateCcw size={14} /> Reactivate account</Button>
        ) : (
          <Button variant="danger" onClick={() => onToggleAccountStatus(user, 'suspended')}><Ban size={14} /> Deactivate account</Button>
        )}
      </div>
    </div>
  );
}

const ROLE_TABS = [
  { value: 'all', label: 'All' },
  { value: 'farmer', label: 'Farmers' },
  { value: 'buyer', label: 'Buyers' },
  { value: 'stakeholder', label: 'Stakeholders' },
];

export default function AdminUsers() {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState(null);
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [notice, setNotice] = useState('');
  const selectedUser = users?.find((user) => user.id === selectedId) || null;
  const filteredUsers = (users || []).filter((user) => roleFilter === 'all' || user.role === roleFilter);
  const { page, setPage, pageRows, pageSize, total } = usePagination(filteredUsers, 10);

  const reload = () => getUsers().then(setUsers);
  useEffect(() => { reload(); }, []);

  const handleVerify = async (user, status) => {
    await setUserVerification(user.id, status);
    setNotice(`${user.name}'s account was ${status === 'verified' ? 'verified' : 'rejected'}.`);
    reload();
  };

  const handleToggleAccountStatus = async (user, status) => {
    await setAccountStatus(user.id, status);
    setNotice(`${user.name}'s account was ${status === 'suspended' ? 'deactivated' : 'reactivated'}.`);
    reload();
  };

  return (
    <AppShell user={currentUser} navItems={adminNavItems} title="Users" fullBleed>
      <PageHeader title="Users" description="Registered farmer, buyer, and stakeholder accounts." />

      <Card>
        <CardHeader title="Registered accounts" />
        {notice ? <Alert tone="success">{notice}</Alert> : null}
        {users === null ? (
          <LoadingState />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {ROLE_TABS.map((tab) => {
                const count = tab.value === 'all' ? users.length : users.filter((user) => user.role === tab.value).length;
                const isActive = roleFilter === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setRoleFilter(tab.value)}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium transition-colors duration-150 ${
                      isActive
                        ? 'border-[#166534] bg-[#166534] text-white'
                        : 'border-[#D0D7DE] bg-white text-[#24292F] hover:bg-[#F6F8FA]'
                    }`}
                  >
                    {tab.label}
                    <span className={isActive ? 'text-white/80' : 'text-[#57606A]'}>{count}</span>
                  </button>
                );
              })}
            </div>
            <Table
              columns={[
                { key: 'name', label: 'Name' },
                { key: 'email', label: 'Email' },
                { key: 'role', label: 'Role' },
                {
                  key: 'verificationStatus',
                  label: 'Verification',
                  render: (row) => (row.verificationStatus ? <Badge tone={verificationTone(row.verificationStatus)}>{verificationStatusLabel(row.verificationStatus)}</Badge> : '—'),
                },
                {
                  key: 'accountStatus',
                  label: 'Account',
                  render: (row) => <Badge tone={accountTone(row.accountStatus)}>{row.accountStatus === 'suspended' ? 'Suspended' : 'Active'}</Badge>,
                },
                { key: 'createdAt', label: 'Created', render: (row) => formatDate(row.createdAt) },
                {
                  key: 'actions',
                  label: '',
                  render: (row) => <Button variant="secondary" onClick={() => setSelectedId(row.id)}>View</Button>,
                },
              ]}
              rows={pageRows}
              emptyMessage={roleFilter === 'all' ? 'No registered users yet.' : `No ${ROLE_TABS.find((tab) => tab.value === roleFilter).label.toLowerCase()} registered yet.`}
            />
            <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
          </>
        )}
      </Card>

      <Modal open={Boolean(selectedUser)} onClose={() => setSelectedId(null)} eyebrow={selectedUser?.role} title={selectedUser?.name}>
        {selectedUser ? (
          <UserDetail key={selectedUser.id} user={selectedUser} onVerify={handleVerify} onToggleAccountStatus={handleToggleAccountStatus} />
        ) : null}
      </Modal>
    </AppShell>
  );
}
