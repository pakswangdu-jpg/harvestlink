import { useEffect, useState } from 'react';
import { ExternalLink, Hash, Truck } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import PageHeader from '../../components/admin/PageHeader';
import { Card, CardHeader } from '../../components/admin/Card';
import Table from '../../components/admin/Table';
import Badge from '../../components/admin/Badge';
import AdminButton from '../../components/admin/Button';
import Modal from '../../components/admin/Modal';
import LoadingState from '../../components/admin/LoadingState';
import Pagination from '../../components/admin/Pagination';
import { usePagination } from '../../components/admin/usePagination';
import {
  orderStatusTone, paymentStatusTone, deliveryStatusTone, paymentStatusLabel, deliveryStepLabel, paymentLabel,
} from '../../components/admin/statusTone';
import CourierDeliveryTimeline from '../../components/orders/CourierDeliveryTimeline';
import { useAuth } from '../auth/AuthContext';
import { getOrders } from '../../services/orderService';
import { getDelivery } from '../../services/deliveryService';
import { courierDeliveryStatusLabel, formatDate, shortOrderId } from '../../utils/formatters';
import { adminNavItems } from './adminNav';

function InfoField({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-[var(--line)] bg-white p-3">
      <Icon size={16} className="mt-0.5 shrink-0 text-[var(--muted)]" />
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
        <p className="break-words text-[13px] font-medium text-[var(--text)]">{value || 'Not provided'}</p>
      </div>
    </div>
  );
}

// Read-only — reuses CourierDeliveryTimeline.jsx exactly as the farmer/buyer see it on
// OrderTracking.jsx (isFarmer=false hides its manual "Mark as" advance control), so admin
// sees the same Courier/Booking Reference/Tracking Status/Tracking URL/Delivery Timeline the
// buyer relies on, without a second, drifting implementation of the same data.
function DeliveryDetail({ order, delivery }) {
  if (!delivery) {
    return <p className="text-[13px] text-[var(--muted)]">No courier has been booked for this order yet.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <InfoField icon={Truck} label="Courier" value={delivery.courierCompany} />
        <InfoField icon={Truck} label="Tracking status" value={courierDeliveryStatusLabel(delivery.deliveryStatus)} />
        <InfoField icon={Hash} label="Booking reference" value={delivery.bookingReference} />
        <InfoField icon={ExternalLink} label="Tracking URL" value={delivery.trackingUrl} />
      </div>

      {delivery.trackingUrl ? (
        <a
          href={delivery.trackingUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-1.5 rounded-md bg-[var(--green-800)] px-3 py-2 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-[#14532d]"
        >
          <ExternalLink size={14} /> Open tracking page
        </a>
      ) : null}

      <div>
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">Delivery timeline</p>
        <CourierDeliveryTimeline order={order} delivery={delivery} isFarmer={false} />
      </div>
    </div>
  );
}

export default function AdminOrders() {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [isDeliveryLoading, setIsDeliveryLoading] = useState(false);
  const { page, setPage, pageRows, pageSize, total } = usePagination(orders || [], 15);

  useEffect(() => {
    let cancelled = false;
    getOrders().then((result) => { if (!cancelled) setOrders(result); });
    return () => { cancelled = true; };
  }, []);

  const openDelivery = async (order) => {
    setSelectedOrder(order);
    setSelectedDelivery(null);
    setIsDeliveryLoading(true);
    try {
      const result = await getDelivery(order.id);
      setSelectedDelivery(result);
    } finally {
      setIsDeliveryLoading(false);
    }
  };

  return (
    <AppShell user={currentUser} navItems={adminNavItems} title="Orders" hideHeader>
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
                {
                  key: 'actions',
                  label: '',
                  render: (row) => (row.deliveryMethod === 'courier' ? (
                    <AdminButton variant="secondary" onClick={() => openDelivery(row)}>
                      <Truck size={14} /> Delivery
                    </AdminButton>
                  ) : null),
                },
              ]}
              rows={pageRows}
              emptyMessage="No orders yet."
            />
            <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
          </>
        )}
      </Card>

      <Modal
        open={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        eyebrow="Courier"
        title={selectedOrder ? `Order #${shortOrderId(selectedOrder.id)}` : ''}
      >
        {isDeliveryLoading ? <LoadingState /> : <DeliveryDetail order={selectedOrder} delivery={selectedDelivery} />}
      </Modal>
    </AppShell>
  );
}
