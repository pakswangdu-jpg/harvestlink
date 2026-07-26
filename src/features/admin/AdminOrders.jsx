import { useEffect, useState } from 'react';
import AppShell from '../../components/layout/AppShell';
import PageHeader from '../../components/admin/PageHeader';
import { Card, CardHeader } from '../../components/admin/Card';
import Table from '../../components/admin/Table';
import Badge from '../../components/admin/Badge';
import LoadingState from '../../components/admin/LoadingState';
import Pagination from '../../components/admin/Pagination';
import { usePagination } from '../../components/admin/usePagination';
import {
  orderStatusTone, paymentStatusTone, deliveryStatusTone, paymentStatusLabel, deliveryStepLabel, paymentLabel,
} from '../../components/admin/statusTone';
import { useAuth } from '../auth/AuthContext';
import { getOrders } from '../../services/orderService';
import { formatDate } from '../../utils/formatters';
import { adminNavItems } from './adminNav';

export default function AdminOrders() {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState(null);
  const { page, setPage, pageRows, pageSize, total } = usePagination(orders || [], 15);

  useEffect(() => {
    let cancelled = false;
    getOrders().then((result) => { if (!cancelled) setOrders(result); });
    return () => { cancelled = true; };
  }, []);

  return (
    <AppShell user={currentUser} navItems={adminNavItems} title="Orders" fullBleed>
      <PageHeader title="Orders" description="Every purchase order placed across the marketplace." />
      <Card>
        <CardHeader title="Purchase orders" />
        {orders === null ? (
          <LoadingState />
        ) : (
          <>
            <Table
              columns={[
                { key: 'buyerName', label: 'Buyer' },
                { key: 'productName', label: 'Product' },
                { key: 'quantity', label: 'Qty' },
                { key: 'paymentMethod', label: 'Payment', render: (row) => paymentLabel(row.paymentMethod) },
                { key: 'paymentStatus', label: 'Payment status', render: (row) => <Badge tone={paymentStatusTone(row.paymentStatus)}>{paymentStatusLabel(row.paymentStatus)}</Badge> },
                { key: 'deliveryStatus', label: 'Delivery', render: (row) => <Badge tone={deliveryStatusTone(row.deliveryStatus)}>{deliveryStepLabel(row.deliveryStatus)}</Badge> },
                { key: 'status', label: 'Status', render: (row) => <Badge tone={orderStatusTone(row.status)}>{row.status}</Badge> },
                { key: 'createdAt', label: 'Created', render: (row) => formatDate(row.createdAt) },
              ]}
              rows={pageRows}
              emptyMessage="No orders yet."
            />
            <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
          </>
        )}
      </Card>
    </AppShell>
  );
}
