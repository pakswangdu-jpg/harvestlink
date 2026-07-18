import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import Button from '../../components/common/Button';
import DataTable from '../../components/dashboard/DataTable';
import EmptyState from '../../components/common/EmptyState';
import StatusBadge from '../../components/common/StatusBadge';
import { useAuth } from '../auth/AuthContext';
import { cancelOrder, getOrdersByBuyer, isCancellable } from '../../services/orderService';
import { ONLINE_PAYMENT_METHODS } from '../../utils/constants';
import { deliveryStepLabel, formatDate } from '../../utils/formatters';
import { getNavItemsForRole } from '../../utils/navItemsByRole';

export default function BuyerOrders() {
  const { currentUser } = useAuth();
  const location = useLocation();
  const navItems = getNavItemsForRole(currentUser.role);
  const [orders, setOrders] = useState([]);
  const [notice, setNotice] = useState(location.state?.notice || '');
  const [error, setError] = useState('');

  const reload = () => getOrdersByBuyer(currentUser.id).then(setOrders);

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
      navItems={navItems}
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
              {
                key: 'productName',
                label: 'Product',
                render: (row) => (
                  <div>
                    <strong>{row.productName}</strong>
                    <br />
                    <span className="muted">{row.quantity} {row.unit}</span>
                  </div>
                ),
              },
              { key: 'farmerName', label: 'Farmer' },
              {
                key: 'payment',
                label: 'Payment',
                render: (row) => (
                  <div className="stacked-badges">
                    <StatusBadge value={row.paymentMethod} type="payment" />
                    <StatusBadge value={row.paymentStatus} type="paymentStatus" />
                  </div>
                ),
              },
              {
                key: 'status',
                label: 'Status',
                render: (row) => (
                  <div className="stacked-badges">
                    <StatusBadge value={row.status} />
                    {/* Delivery progress only means anything once the farmer has actually
                        confirmed the order — for pending/rejected/cancelled orders,
                        deliveryStatus is just its untouched default and showing it (e.g.
                        "Order confirmed" for a REJECTED order) is actively misleading. */}
                    {row.status === 'confirmed' ? (
                      <span className="muted table-substatus">{deliveryStepLabel(row.deliveryStatus)}</span>
                    ) : null}
                  </div>
                ),
              },
              { key: 'updatedAt', label: 'Updated', render: (row) => formatDate(row.updatedAt) },
              {
                key: 'actions',
                label: 'Action',
                render: (row) => (
                  <div className="table-actions">
                    <Link className="btn btn-secondary btn-sm" to={`/orders/${row.id}`}>Track</Link>
                    {row.paymentStatus === 'pending' && ONLINE_PAYMENT_METHODS.includes(row.paymentMethod) ? (
                      <Link className="btn btn-primary btn-sm" to={`/orders/${row.id}/pay/gcash`}>Pay now</Link>
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
