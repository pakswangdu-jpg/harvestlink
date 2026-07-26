import { Calendar, Mail } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import PageHeader from '../../components/admin/PageHeader';
import { Card, CardHeader } from '../../components/admin/Card';
import Badge from '../../components/admin/Badge';
import { useAuth } from '../auth/AuthContext';
import { formatDate, getInitials } from '../../utils/formatters';
import { adminNavItems } from './adminNav';

export default function AdminProfile() {
  const { currentUser: user } = useAuth();

  return (
    <AppShell user={user} navItems={adminNavItems} title="Profile" fullBleed>
      <PageHeader title="Profile" description="Your admin account details." />

      <Card className="mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F6F8FA] text-[13px] font-semibold text-[#24292F]">
            {getInitials(user.name)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-[#24292F]">{user.name}</p>
            <p className="flex items-center gap-1.5 text-[13px] text-[#57606A]"><Mail size={13} /> {user.email}</p>
          </div>
          <Badge>{user.role}</Badge>
        </div>
      </Card>

      <Card>
        <CardHeader eyebrow="Personal" title="Account information" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex items-start gap-2.5 rounded-md border border-[#D0D7DE] p-3">
            <Mail size={16} className="mt-0.5 shrink-0 text-[#57606A]" />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-[#57606A]">Email</p>
              <p className="text-[13px] font-medium text-[#24292F]">{user.email}</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5 rounded-md border border-[#D0D7DE] p-3">
            <Calendar size={16} className="mt-0.5 shrink-0 text-[#57606A]" />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-[#57606A]">Member since</p>
              <p className="text-[13px] font-medium text-[#24292F]">{formatDate(user.createdAt)}</p>
            </div>
          </div>
        </div>
      </Card>
    </AppShell>
  );
}
