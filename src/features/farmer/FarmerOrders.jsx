import { useEffect, useState } from 'react';
import { Check, Navigation, Truck, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import ordersEmptyIcon from '../../assets/icons/orders-empty.png';
import StatusBadge from '../../components/common/StatusBadge';
import DataTable from '../../components/dashboard/DataTable';
import ZoomableImage from '../../components/common/ZoomableImage';
import { useAuth } from '../auth/AuthContext';
import { advanceDelivery, getNextDeliveryStatus, getOrdersByFarmer, updateOrderStatus } from '../../services/orderService';
import { approvePaymentVerification, rejectPaymentVerification } from '../../services/paymentService';
import { DELIVERY_STEP_LABELS } from '../../utils/constants';
import { formatCurrency, formatDate, shortOrderId } from '../../utils/formatters';
import { farmerNavItems } from './farmerNav';

export default function FarmerOrders() {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

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

  const handleConfirmReject = async (orderId) => {
    if (!rejectReason.trim()) {
      setError('Enter a reason for rejecting this payment.');
      return;
    }
    await run(() => rejectPaymentVerification(orderId, rejectReason.trim()), 'Payment rejected.');
    setRejectingId(null);
    setRejectReason('');
  };

  // Only GCash orders ever go through submitPaymentProof (see payments.controller.js) —
  // COD orders never set paymentVerificationStatus at all, so this naturally excludes them.
  const pendingVerifications = orders.filter((order) => order.paymentVerificationStatus === 'pending');

  return (
    <AppShell
      user={currentUser}
      navItems={farmerNavItems}
      title="Buyer orders"
      subtitle="Confirm or reject orders, then move confirmed orders through delivery."
    >
      {notice ? <div className="form-alert success">{notice}</div> : null}
      {error ? <div className="form-alert error">{error}</div> : null}

      {pendingVerifications.length ? (
        <section className="panel payment-verification-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Payments</p>
              <h2>Payment Verification</h2>
            </div>
            <span className="badge badge-pending">{pendingVerifications.length} pending</span>
          </div>

          <div className="payment-verification-list">
            {pendingVerifications.map((order) => (
              <div key={order.id} className="payment-verification-card">
                <div className="payment-verification-receipt">
                  <ZoomableImage
                    src={order.paymentReceiptUrl}
                    alt={`Payment receipt from ${order.buyerName}`}
                    fallbackMessage="Unable to load this receipt."
                    className="payment-verification-receipt-image"
                  />
                </div>

                <div className="payment-verification-details">
                  <div className="ot-detail-row"><span>Buyer</span><strong>{order.buyerName}</strong></div>
                  <div className="ot-detail-row"><span>Order #</span><strong>{shortOrderId(order.id)}</strong></div>
                  <div className="ot-detail-row"><span>Amount</span><strong>{formatCurrency(order.totalAmount)}</strong></div>
                  <div className="ot-detail-row"><span>Reference #</span><strong>{order.paymentReferenceNumber || '—'}</strong></div>
                  <div className="ot-detail-row"><span>Sender name</span><strong>{order.paymentSenderName || '—'}</strong></div>
                  <div className="ot-detail-row"><span>Submitted</span><strong>{formatDate(order.paymentSubmittedAt)}</strong></div>
                  {order.paymentNotes ? (
                    <div className="ot-detail-row"><span>Notes</span><strong>{order.paymentNotes}</strong></div>
                  ) : null}

                  {rejectingId === order.id ? (
                    <div className="form-stack payment-verification-reject-form">
                      <textarea
                        rows="2"
                        value={rejectReason}
                        onChange={(event) => setRejectReason(event.target.value)}
                        placeholder="Reason for rejecting this payment"
                      />
                      <div className="table-actions">
                        <Button size="sm" variant="danger" onClick={() => handleConfirmReject(order.id)}>Confirm Reject</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setRejectingId(null); setRejectReason(''); }}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="table-actions">
                      <Button size="sm" onClick={() => run(() => approvePaymentVerification(order.id), 'Payment approved.')}>
                        <Check size={15} /> Approve Payment
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => { setRejectingId(order.id); setRejectReason(''); }}>
                        <X size={15} /> Reject Payment
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

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
                    // A courier order's packed -> out_for_delivery step is booking a real
                    // Lalamove delivery (driver/vehicle/tracking link) — too much for a
                    // table cell, so this just sends the farmer to the order page, which has
                    // the full "Book with Lalamove" flow (see DeliveryInfoCard.jsx).
                    const isCourierReadyForBooking = row.deliveryMethod === 'courier' && nextStep === 'out_for_delivery';
                    return (
                      <div className="table-actions">
                        {isCourierReadyForBooking ? (
                          <Link className="btn btn-primary btn-sm" to={`/orders/${row.id}`}>
                            <Truck size={14} /> Book with Lalamove
                          </Link>
                        ) : nextStep ? (
                          <Button size="sm" onClick={() => run(() => advanceDelivery(row.id), `Order marked "${DELIVERY_STEP_LABELS[nextStep]}".`)}>
                            {nextStep === 'out_for_delivery' ? (
                              <><Navigation size={14} /> Start Delivery</>
                            ) : (
                              <>Mark {DELIVERY_STEP_LABELS[nextStep]}</>
                            )}
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
          <EmptyState className="empty-state-transparent-icon" iconSrc={ordersEmptyIcon} title="No orders yet" message="Buyer orders for your products will appear here." />
        )}
      </section>
    </AppShell>
  );
}
