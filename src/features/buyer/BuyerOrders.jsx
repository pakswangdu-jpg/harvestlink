import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import Button from '../../components/common/Button';
import DataTable from '../../components/dashboard/DataTable';
import EmptyState from '../../components/common/EmptyState';
import StatusBadge from '../../components/common/StatusBadge';
import { useAuth } from '../auth/AuthContext';
import { cancelOrder, getOrdersByBuyer, isCancellable, payOrder } from '../../services/orderService';
import { ONLINE_PAYMENT_METHODS, STORAGE_KEYS } from '../../utils/constants';
import { formatDate } from '../../utils/formatters';
import { buyerNavItems } from './buyerNav';

export default function BuyerOrders() {
  const { currentUser } = useAuth();
  const location = useLocation();
  const [orders, setOrders] = useState(() => getOrdersByBuyer(currentUser.id));
  const [notice, setNotice] = useState(location.state?.notice || '');
  const [error, setError] = useState('');

  const reload = () => setOrders(getOrdersByBuyer(currentUser.id));

  useEffect(() => {
    const handleStorage = (event) => {
      if (!event.key || event.key === STORAGE_KEYS.orders) reload();
    };
    const interval = setInterval(reload, 4000);
    window.addEventListener('storage', handleStorage);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const run = (action, successMessage) => {
    try {
      action();
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
      navItems={buyerNavItems}
      title="My orders"
      subtitle="Track payment and delivery status for every order you've placed."
    >
      {notice ? <div className="form-alert success">{notice}</div> : null}
      {error ? <div className="form-alert error">{error}</div> : null}

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">History</p>
            <h2>Order history</h2>
          </div>
        </div>

        {orders.length ? (
          <DataTable
            columns={[
              { key: 'productName', label: 'Product' },
              { key: 'quantity', label: 'Quantity', render: (row) => `${row.quantity} ${row.unit}` },
              { key: 'farmerName', label: 'Farmer' },
              { key: 'paymentMethod', label: 'Payment', render: (row) => <StatusBadge value={row.paymentMethod} type="payment" /> },
              { key: 'paymentStatus', label: 'Payment status', render: (row) => <StatusBadge value={row.paymentStatus} type="paymentStatus" /> },
              { key: 'deliveryStatus', label: 'Delivery', render: (row) => <StatusBadge value={row.deliveryStatus} type="deliveryStatus" /> },
              { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
              { key: 'updatedAt', label: 'Updated', render: (row) => formatDate(row.updatedAt) },
              {
                key: 'actions',
                label: 'Action',
                render: (row) => (
                  <div className="table-actions">
                    <Link className="btn btn-secondary btn-sm" to={`/orders/${row.id}`}>Track</Link>
                    {row.paymentStatus === 'pending' && ONLINE_PAYMENT_METHODS.includes(row.paymentMethod) ? (
                      <Button size="sm" onClick={() => run(() => payOrder(row.id), 'Payment confirmed.')}>Pay now</Button>
                    ) : null}
                    {isCancellable(row) ? (
                      <Button size="sm" variant="danger" onClick={() => run(() => cancelOrder(row.id), 'Order cancelled.')}>Cancel</Button>
                    ) : null}
                  </div>
                ),
              },
            ]}
            rows={orders}
            emptyMessage="No orders yet."
          />
        ) : (
          <EmptyState title="No orders yet" message="Open a product in the marketplace and place your first order." />
        )}
      </section>
    </AppShell>
  );
}
