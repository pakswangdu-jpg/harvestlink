import AppShell from '../../components/layout/AppShell';
import PageHeader from '../../components/admin/PageHeader';
import { Card, CardHeader } from '../../components/admin/Card';
import Table from '../../components/admin/Table';
import Badge from '../../components/admin/Badge';
import Pagination from '../../components/admin/Pagination';
import { usePagination } from '../../components/admin/usePagination';
import { donationTone, donationStatusLabel } from '../../components/admin/statusTone';
import { useAuth } from '../auth/AuthContext';
import { getDonations } from '../../services/donationService';
import { formatDate } from '../../utils/formatters';
import { adminNavItems } from './adminNav';

export default function AdminDonations() {
  const { currentUser } = useAuth();
  // Still localStorage-backed (see donationService.js), a synchronous read — no loading state
  // needed, matching the original AdminDashboard.jsx's own handling of it.
  const donations = getDonations();
  const { page, setPage, pageRows, pageSize, total } = usePagination(donations, 15);

  return (
    <AppShell user={currentUser} navItems={adminNavItems} title="Donations" hideHeader>
      <PageHeader title="Donations" description="Surplus donation lifecycle across every farmer and partner organization." />
      <Card>
        <CardHeader title="Surplus donations" />
        <Table
          columns={[
            { key: 'productName', label: 'Product' },
            { key: 'farmerName', label: 'Farmer' },
            { key: 'quantity', label: 'Qty', render: (row) => `${row.quantity} ${row.unit}` },
            { key: 'requestedByName', label: 'Organization', render: (row) => row.requestedByName || '—' },
            { key: 'pickupDate', label: 'Pickup', render: (row) => (row.pickupDate ? formatDate(row.pickupDate) : '—') },
            { key: 'status', label: 'Status', render: (row) => <Badge tone={donationTone(row.status)}>{donationStatusLabel(row.status)}</Badge> },
          ]}
          rows={pageRows}
          emptyMessage="No donations yet."
        />
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
      </Card>
    </AppShell>
  );
}
