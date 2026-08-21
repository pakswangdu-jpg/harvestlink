import { Calendar, Mail } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import PageHeader from '../../components/admin/PageHeader';
import { Card, CardHeader } from '../../components/admin/Card';
import Badge from '../../components/admin/Badge';
import ThemeToggle from '../../components/common/ThemeToggle';
import { useAuth } from '../auth/AuthContext';
import { formatDate, getInitials } from '../../utils/formatters';
import { adminNavItems } from './adminNav';

export default function AdminProfile() {
  const { currentUser: user } = useAuth();

  return (
    <AppShell user={user} navItems={adminNavItems} title="Profile" hideHeader>
      <PageHeader title="Profile" description="Your admin account details." />

      <Card className="mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--soft)] text-[13px] font-semibold text-[var(--text)]">
            {getInitials(user.name)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-[var(--text)]">{user.name}</p>
            <p className="flex items-center gap-1.5 text-[13px] text-[var(--muted)]"><Mail size={13} /> {user.email}</p>
          </div>
          <Badge>{user.role}</Badge>
        </div>
      </Card>

      <Card>
        <CardHeader eyebrow="Personal" title="Account information" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex items-start gap-2.5 rounded-md border border-[var(--line)] p-3">
            <Mail size={16} className="mt-0.5 shrink-0 text-[var(--muted)]" />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Email</p>
              <p className="text-[13px] font-medium text-[var(--text)]">{user.email}</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5 rounded-md border border-[var(--line)] p-3">
            <Calendar size={16} className="mt-0.5 shrink-0 text-[var(--muted)]" />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Member since</p>
              <p className="text-[13px] font-medium text-[var(--text)]">{formatDate(user.createdAt)}</p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader eyebrow="Preferences" title="Appearance" />
        <p className="mb-3 text-[13px] text-[var(--muted)]">Choose how HarvestLink looks on this device. System matches your OS setting automatically.</p>
        <div className="max-w-xs">
          <ThemeToggle />
        </div>
      </Card>
    </AppShell>
  );
}
