import { useEffect, useMemo, useState } from 'react';
import {
  Check, ClipboardList, MapPin, Navigation, Package, Search, Truck, X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import StatusBadge from '../../components/common/StatusBadge';
import ZoomableImage from '../../components/common/ZoomableImage';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { advanceDelivery, getNextDeliveryStatus, getOrdersByFarmer, updateOrderStatus } from '../../services/orderService';
import { approvePaymentVerification, rejectPaymentVerification } from '../../services/paymentService';
import { formatCurrency, formatDate, paymentLabel, deliveryMethodLabel, shortOrderId } from '../../utils/formatters';
import { farmerNavItems } from './farmerNav';

// Collapses the order's real status/deliveryStatus columns into the 7 lifecycle stages a
// farmer actually thinks in (see DELIVERY_SEQUENCES in constants.js for the underlying
// per-method step lists this reads from). "packed" folds into "preparing" here — it's still
// the same "not moving yet" phase from the farmer's point of view — but the underlying
// advance-delivery action still walks the real steps one at a time, so nothing is skipped.
function getOrderStage(order) {
  if (order.status === 'pending') return 'pending';
  if (order.status === 'rejected') return 'rejected';
  if (order.status === 'cancelled') return 'cancelled';
  if (order.status === 'completed') return 'completed';
  const step = order.deliveryStatus;
  if (step === 'pending') return 'confirmed';
  if (step === 'preparing' || step === 'packed') return 'preparing';
  if (step === 'ready_for_pickup') return 'ready_for_pickup';
  if (step === 'out_for_delivery') return 'out_for_delivery';
  if (step === 'picked_up' || step === 'delivered') return 'completed';
  return 'confirmed';
}

const STAGE_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready_for_pickup: 'Ready for Pickup',
  out_for_delivery: 'Out for Delivery',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

// Tabs are a deliberately shorter list than every possible stage — Rejected/Cancelled orders
// still show up (and are still searchable/countable) inside "All", they just don't get their
// own tab, so this strip stays a quick-glance "what needs me" filter, not a full status list.
const STAGE_TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready_for_pickup', label: 'Ready for Pickup' },
  { key: 'out_for_delivery', label: 'Delivering' },
  { key: 'completed', label: 'Completed' },
];

const PAYMENT_FILTER_OPTIONS = [
  { value: 'all', label: 'All payments' },
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'Payment pending' },
  { value: 'refunded', label: 'Refunded' },
];

const DELIVERY_FILTER_OPTIONS = [
  { value: 'all', label: 'All delivery' },
  { value: 'buyer_pickup', label: 'Buyer pickup' },
  { value: 'farmer_delivery', label: 'Farmer delivery' },
  { value: 'courier', label: 'Third-party courier' },
];

const DATE_FILTER_OPTIONS = [
  { value: 'all', label: 'Any date' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

function isWithinDateFilter(order, dateFilter) {
  if (dateFilter === 'all') return true;
  const created = new Date(order.createdAt).getTime();
  const days = dateFilter === 'today' ? 1 : dateFilter === '7d' ? 7 : 30;
  return Date.now() - created <= days * 24 * 60 * 60 * 1000;
}

// The action column's whole point: exactly one primary next step per order, not a grab-bag of
// buttons. Mirrors the real per-delivery-method step sequence (DELIVERY_SEQUENCES) instead of
// a separate hardcoded list, so a farmer can never be shown a step that skips or repeats one.
function getPrimaryAction(order) {
  if (order.status === 'pending') return { kind: 'confirm' };
  if (order.status !== 'confirmed') return { kind: 'view' };

  const nextStep = getNextDeliveryStatus(order);
  if (!nextStep) return { kind: 'view' };

  if (nextStep === 'preparing') return { kind: 'advance', next: nextStep, label: 'Prepare Order' };
  if (nextStep === 'packed' || nextStep === 'ready_for_pickup') {
    return { kind: 'advance', next: nextStep, label: 'Mark Ready' };
  }
  if (nextStep === 'out_for_delivery') {
    // A courier order's next step is booking a real Lalamove delivery (driver/vehicle/
    // tracking link) — too much for a table row, so this sends the farmer to the full order
    // page instead, which already has the "Book with Lalamove" flow (see DeliveryInfoCard.jsx).
    if (order.deliveryMethod === 'courier') return { kind: 'book-courier' };
    return { kind: 'advance', next: nextStep, label: 'Start Delivery' };
  }
  if (nextStep === 'picked_up') {
    return {
      kind: 'advance', next: nextStep, label: 'Mark Picked Up', requiresConfirm: true,
      confirmMessage: 'Confirm the buyer has picked up this order. This can\'t be undone.',
    };
  }
  if (nextStep === 'delivered') {
    return {
      kind: 'advance', next: nextStep, label: 'Mark Delivered', requiresConfirm: true,
      confirmMessage: 'Confirm this order has been delivered. This can\'t be undone.',
    };
  }
  return { kind: 'view' };
}

function OrderStageBadge({ order }) {
  const stage = getOrderStage(order);
  return <span className={`badge badge-status badge-${stage}`}>{STAGE_LABELS[stage]}</span>;
}

function OrderCell({ order }) {
  return (
    <div>
      <div className="order-cell-main">{order.productName}</div>
      <div className="order-cell-sub">{order.quantity} {order.unit}</div>
    </div>
  );
}

function PaymentCell({ order }) {
  return (
    <div>
      <div className="order-cell-main">{paymentLabel(order.paymentMethod)}</div>
      <div className="order-cell-sub">
        <StatusBadge value={order.paymentStatus} type="paymentStatus" />
      </div>
    </div>
  );
}

function DeliveryCell({ order }) {
  const stage = getOrderStage(order);
  return (
    <div>
      <div className="order-cell-main">{deliveryMethodLabel(order.deliveryMethod)}</div>
      {stage === 'out_for_delivery' ? <div className="order-cell-sub">In transit</div> : null}
    </div>
  );
}

// One primary action per row, matching getPrimaryAction's decision exactly — Pending is the
// only stage that also gets a secondary (Reject) button.
function OrderActions({ order, onAction }) {
  const action = getPrimaryAction(order);

  if (action.kind === 'confirm') {
    return (
      <div className="table-actions order-table-actions">
        <Button size="sm" onClick={() => onAction('confirm', order)}>
          <Check size={14} /> Confirm Order
        </Button>
        <Button size="sm" variant="danger" onClick={() => onAction('reject', order)}>
          <X size={14} /> Reject
        </Button>
      </div>
    );
  }

  if (action.kind === 'book-courier') {
    return (
      <Link className="btn btn-primary btn-sm order-action-single" to={`/orders/${order.id}`}>
        <Truck size={14} /> Book with Lalamove
      </Link>
    );
  }

  if (action.kind === 'advance') {
    return (
      <div className="table-actions order-table-actions">
        <Button
          size="sm"
          onClick={() => onAction('advance', order, action)}
        >
          {action.label === 'Start Delivery' ? <Navigation size={14} /> : <Check size={14} />} {action.label}
        </Button>
        {getOrderStage(order) === 'out_for_delivery' ? (
          <Link className="btn btn-secondary btn-sm" to={`/orders/${order.id}`}>
            <MapPin size={14} /> Track Delivery
          </Link>
        ) : null}
      </div>
    );
  }

  return <Link className="btn btn-secondary btn-sm order-action-single" to={`/orders/${order.id}`}>View Details</Link>;
}

export default function FarmerOrders() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [rejectTarget, setRejectTarget] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [paymentRejectingId, setPaymentRejectingId] = useState(null);
  const [paymentRejectReason, setPaymentRejectReason] = useState('');

  const [activeStage, setActiveStage] = useState('all');
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [deliveryFilter, setDeliveryFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

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
      showToast({ type: 'success', message: successMessage });
      reload();
    } catch (actionError) {
      showToast({ type: 'error', message: actionError.message });
    }
  };

  const handleAction = (type, order, action) => {
    if (type === 'confirm') {
      run(() => updateOrderStatus(order.id, 'confirmed'), 'Order confirmed.');
      return;
    }
    if (type === 'reject') {
      setRejectTarget(order);
      return;
    }
    if (type === 'advance') {
      if (action.requiresConfirm) {
        setConfirmAction({ order, action });
        return;
      }
      run(() => advanceDelivery(order.id), `Order marked "${action.label}".`);
    }
  };

  const confirmReject = () => {
    if (!rejectTarget) return;
    run(() => updateOrderStatus(rejectTarget.id, 'rejected'), 'Order rejected.');
    setRejectTarget(null);
  };

  const confirmAdvance = () => {
    if (!confirmAction) return;
    const { order, action } = confirmAction;
    run(() => advanceDelivery(order.id), `Order marked "${action.label}".`);
    setConfirmAction(null);
  };

  const handleConfirmPaymentReject = async () => {
    if (!paymentRejectReason.trim()) {
      setError('Enter a reason for rejecting this payment.');
      return;
    }
    await run(() => rejectPaymentVerification(paymentRejectingId, paymentRejectReason.trim()), 'Payment rejected.');
    setPaymentRejectingId(null);
    setPaymentRejectReason('');
  };

  // Only GCash orders ever go through submitPaymentProof (see payments.controller.js) —
  // COD orders never set paymentVerificationStatus at all, so this naturally excludes them.
  const pendingVerifications = orders.filter((order) => order.paymentVerificationStatus === 'pending');

  const stageCounts = useMemo(() => {
    const counts = { all: orders.length };
    STAGE_TABS.forEach((tab) => { if (tab.key !== 'all') counts[tab.key] = 0; });
    orders.forEach((order) => {
      const stage = getOrderStage(order);
      if (stage in counts) counts[stage] += 1;
    });
    return counts;
  }, [orders]);

  const hasActiveFilters = activeStage !== 'all' || search.trim() || paymentFilter !== 'all' || deliveryFilter !== 'all' || dateFilter !== 'all';

  const clearFilters = () => {
    setActiveStage('all');
    setSearch('');
    setPaymentFilter('all');
    setDeliveryFilter('all');
    setDateFilter('all');
  };

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (activeStage !== 'all' && getOrderStage(order) !== activeStage) return false;
      if (paymentFilter !== 'all' && order.paymentStatus !== paymentFilter) return false;
      if (deliveryFilter !== 'all' && order.deliveryMethod !== deliveryFilter) return false;
      if (!isWithinDateFilter(order, dateFilter)) return false;
      if (query) {
        const haystack = `${order.buyerName} ${order.productName}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [orders, activeStage, search, paymentFilter, deliveryFilter, dateFilter]);

  return (
    <AppShell
      user={currentUser}
      navItems={farmerNavItems}
      title="Purchase Orders"
      subtitle="Review incoming orders, prepare purchases, and manage deliveries."
      pageClassName="farmer-orders-page"
    >
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

                  {paymentRejectingId === order.id ? (
                    <div className="form-stack payment-verification-reject-form">
                      <textarea
                        rows="2"
                        value={paymentRejectReason}
                        onChange={(event) => setPaymentRejectReason(event.target.value)}
                        placeholder="Reason for rejecting this payment"
                      />
                      <div className="table-actions">
                        <Button size="sm" variant="danger" onClick={handleConfirmPaymentReject}>Confirm Reject</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setPaymentRejectingId(null); setPaymentRejectReason(''); }}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="table-actions">
                      <Button size="sm" onClick={() => run(() => approvePaymentVerification(order.id), 'Payment approved.')}>
                        <Check size={15} /> Approve Payment
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => { setPaymentRejectingId(order.id); setPaymentRejectReason(''); }}>
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
            <p className="eyebrow">Order management</p>
            <h2>Purchase Orders</h2>
          </div>
        </div>

        {orders.length ? (
          <>
            <div className="filter-tabs" role="tablist" aria-label="Filter by order stage">
              {STAGE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeStage === tab.key}
                  className={`filter-tab ${activeStage === tab.key ? 'active' : ''}`}
                  onClick={() => setActiveStage(tab.key)}
                >
                  {tab.label}
                  <span className="filter-tab-count">{stageCounts[tab.key] || 0}</span>
                </button>
              ))}
            </div>

            <div className="order-toolbar">
              <label className="search-field order-toolbar-search">
                <Search size={15} className="text-[var(--muted)]" aria-hidden="true" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search orders..."
                  aria-label="Search orders by buyer or product"
                />
              </label>

              <div className="order-toolbar-filters">
                <select
                  className="order-toolbar-select"
                  value={paymentFilter}
                  onChange={(event) => setPaymentFilter(event.target.value)}
                  aria-label="Filter by payment status"
                >
                  {PAYMENT_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <select
                  className="order-toolbar-select"
                  value={deliveryFilter}
                  onChange={(event) => setDeliveryFilter(event.target.value)}
                  aria-label="Filter by delivery method"
                >
                  {DELIVERY_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <select
                  className="order-toolbar-select"
                  value={dateFilter}
                  onChange={(event) => setDateFilter(event.target.value)}
                  aria-label="Filter by date"
                >
                  {DATE_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                {hasActiveFilters ? (
                  <button type="button" className="order-toolbar-reset" onClick={clearFilters}>Clear filters</button>
                ) : null}
              </div>
            </div>

            {filteredOrders.length ? (
              <>
                <div className="order-table-wrap table-wrap">
                  <table>
                    <colgroup>
                      <col className="order-col-buyer" />
                      <col className="order-col-order" />
                      <col className="order-col-payment" />
                      <col className="order-col-delivery" />
                      <col className="order-col-status" />
                      <col className="order-col-date" />
                      <col className="order-col-action" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Buyer</th>
                        <th>Order</th>
                        <th>Payment</th>
                        <th>Delivery</th>
                        <th>Order Status</th>
                        <th>Date</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((order) => (
                        <tr key={order.id}>
                          <td><strong>{order.buyerName}</strong></td>
                          <td><OrderCell order={order} /></td>
                          <td><PaymentCell order={order} /></td>
                          <td><DeliveryCell order={order} /></td>
                          <td><OrderStageBadge order={order} /></td>
                          <td><span className="muted">{formatDate(order.createdAt)}</span></td>
                          <td><OrderActions order={order} onAction={handleAction} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="order-mobile-cards">
                  {filteredOrders.map((order) => (
                    <div key={order.id} className="order-mobile-card">
                      <div className="order-mobile-card-top">
                        <span className="order-mobile-card-buyer">{order.buyerName}</span>
                        <span className="order-mobile-card-date">{formatDate(order.createdAt)}</span>
                      </div>

                      <div>
                        <div className="order-cell-main">{order.productName}</div>
                        <div className="order-cell-sub">{order.quantity} {order.unit}</div>
                      </div>

                      <div className="order-mobile-card-grid">
                        <div>
                          <p className="order-mobile-card-label">Payment</p>
                          <p className="order-mobile-card-value">{paymentLabel(order.paymentMethod)}</p>
                          <StatusBadge value={order.paymentStatus} type="paymentStatus" />
                        </div>
                        <div>
                          <p className="order-mobile-card-label">Delivery</p>
                          <p className="order-mobile-card-value">{deliveryMethodLabel(order.deliveryMethod)}</p>
                          {getOrderStage(order) === 'out_for_delivery' ? <span className="order-cell-sub">In transit</span> : null}
                        </div>
                      </div>

                      <div>
                        <p className="order-mobile-card-label">Status</p>
                        <div className="mt-1"><OrderStageBadge order={order} /></div>
                      </div>

                      <div className="order-mobile-card-actions">
                        <OrderActions order={order} onAction={handleAction} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState
                icon={Package}
                title="No matching orders"
                message="Try a different search term or clear your filters."
                actionLabel={hasActiveFilters ? 'Clear filters' : undefined}
                onAction={clearFilters}
              />
            )}
          </>
        ) : (
          <EmptyState icon={ClipboardList} title="No purchase orders yet" message="When buyers place orders for your products, they'll appear here." />
        )}
      </section>

      <ConfirmDialog
        open={Boolean(rejectTarget)}
        title={rejectTarget ? `Reject order from ${rejectTarget.buyerName}?` : ''}
        message="This order will be marked as rejected and the buyer will be notified. This action cannot be undone."
        confirmLabel="Reject Order"
        onConfirm={confirmReject}
        onCancel={() => setRejectTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction ? confirmAction.action.label : ''}
        message={confirmAction?.action.confirmMessage || ''}
        confirmLabel={confirmAction ? confirmAction.action.label : 'Confirm'}
        onConfirm={confirmAdvance}
        onCancel={() => setConfirmAction(null)}
      />
    </AppShell>
  );
}
