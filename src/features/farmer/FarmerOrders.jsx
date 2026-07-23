import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import StatusBadge from '../../components/common/StatusBadge';
import DataTable from '../../components/dashboard/DataTable';
import { useAuth } from '../auth/AuthContext';
import { advanceDelivery, getNextDeliveryStatus, getOrdersByFarmer, updateOrderStatus } from '../../services/orderService';
import { DELIVERY_STEP_LABELS } from '../../utils/constants';
import { formatDate } from '../../utils/formatters';
import { farmerNavItems } from './farmerNav';

export default function FarmerOrders() {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const reload = () => getOrdersByFarmer(currentUser.id).then(setOrders);

  useEffect(() => {
    reload();
    const interval = setInterval(reload, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const run = async (action, successMessage) => {
    try {
      await action();
      setError('');
      setNotice(successMessage);
      reload();
    } catch (actionError) {
      setNotice('');
      setError(actionError.message);
    }
  };

  return (
    <AppShell
      user={currentUser}
      navItems={farmerNavItems}
      title="Buyer orders"
      subtitle="Confirm or reject orders, then move confirmed orders through delivery."
    >
      {notice ? <div className="form-alert success">{notice}</div> : null}
      {error ? <div className="form-alert error">{error}</div> : null}

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Order queue</p>
            <h2>Purchase orders</h2>
          </div>
        </div>

        {orders.length ? (
          <DataTable
            columns={[
              { key: 'buyerName', label: 'Buyer' },
              { key: 'productName', label: 'Product' },
              { key: 'quantity', label: 'Quantity', render: (row) => `${row.quantity} ${row.unit}` },
              { key: 'paymentMethod', label: 'Payment', render: (row) => <StatusBadge value={row.paymentMethod} type="payment" /> },
              { key: 'paymentStatus', label: 'Payment status', render: (row) => <StatusBadge value={row.paymentStatus} type="paymentStatus" /> },
              { key: 'deliveryMethod', label: 'Delivery', render: (row) => <StatusBadge value={row.deliveryMethod} type="deliveryMethod" /> },
              { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
              { key: 'createdAt', label: 'Date', render: (row) => <span className="muted">{formatDate(row.createdAt)}</span> },
              {
                key: 'actions',
                label: 'Action',
                render: (row) => {
                  if (row.status === 'pending') {
                    return (
                      <div className="table-actions">
                        <Button size="sm" onClick={() => run(() => updateOrderStatus(row.id, 'confirmed'), 'Order confirmed.')}>
                          <Check size={15} /> Confirm
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => run(() => updateOrderStatus(row.id, 'rejected'), 'Order rejected.')}>
                          <X size={15} /> Reject
                        </Button>
                      </div>
                    );
                  }

                  if (row.status === 'confirmed') {
                    const nextStep = getNextDeliveryStatus(row);
                    return (
                      <div className="table-actions">
                        {nextStep ? (
                          <Button size="sm" onClick={() => run(() => advanceDelivery(row.id), `Order marked "${DELIVERY_STEP_LABELS[nextStep]}".`)}>
                            Mark {DELIVERY_STEP_LABELS[nextStep]}
                          </Button>
                        ) : null}
                        <Link className="btn btn-secondary btn-sm" to={`/orders/${row.id}`}>Track</Link>
                      </div>
                    );
                  }

                  return <Link className="btn btn-secondary btn-sm" to={`/orders/${row.id}`}>Track</Link>;
                },
              },
            ]}
            rows={orders}
            emptyMessage="No orders yet."
          />
        ) : (
          <EmptyState title="No orders yet" message="Buyer orders for your products will appear here." />
        )}
      </section>
    </AppShell>
  );
}
