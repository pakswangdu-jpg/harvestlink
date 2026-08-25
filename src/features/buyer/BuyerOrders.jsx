import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  CheckCircle2, ClipboardList, CreditCard, Eye, MapPin, Package, RotateCcw, Search, X,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import StatusBadge from '../../components/common/StatusBadge';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { advanceDelivery, cancelOrder, getOrdersByBuyer, isCancellable } from '../../services/orderService';
import { ONLINE_PAYMENT_METHODS } from '../../utils/constants';
import { formatCurrency, formatDate, getInitials, paymentLabel, shortOrderId } from '../../utils/formatters';
import { getNavItemsForRole } from '../../utils/navItemsByRole';

// A buyer's own read of the order lifecycle — distinct from the farmer's version
// (FarmerOrders.jsx's getOrderStage), because "delivered but not yet confirmed by the buyer"
// is a stage the farmer has nothing left to do in (so that page collapses it into
// "completed"), while the buyer still has one thing to do: confirm receipt. Collapsing it
// the same way here would hide the "Confirm Received" action this exact stage needs.
function getBuyerOrderStage(order) {
  if (order.status === 'pending') return 'pending';
  if (order.status === 'rejected') return 'rejected';
  if (order.status === 'cancelled') return 'cancelled';
  if (order.status === 'completed') return 'completed';
  const step = order.deliveryStatus;
  if (step === 'pending') return 'confirmed';
  if (step === 'preparing' || step === 'packed') return 'preparing';
  if (step === 'ready_for_pickup') return 'ready_for_pickup';
  if (step === 'out_for_delivery') return 'out_for_delivery';
  if (step === 'picked_up' || step === 'delivered') return 'delivered';
  return 'confirmed';
}

const STAGE_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready_for_pickup: 'Ready for Pickup',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const STAGE_TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const PAYMENT_FILTER_OPTIONS = [
  { value: 'all', label: 'All payments' },
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'Payment pending' },
];

// A GCash order already awaiting the farmer's verification of a submitted receipt has no
// "pay again" step — showing Pay Now here would let the buyer try to submit a second,
// conflicting payment for the same order. Mirrors OrderTracking.jsx's own gate exactly.
function canPayNow(order) {
  return order.paymentStatus === 'pending' && ONLINE_PAYMENT_METHODS.includes(order.paymentMethod) && !order.paymentVerificationStatus;
}

function isWithinDateRange(order, fromDate, toDate) {
  const created = new Date(order.createdAt).getTime();
  if (fromDate && created < new Date(fromDate).getTime()) return false;
  if (toDate && created > new Date(toDate).getTime() + 24 * 60 * 60 * 1000 - 1) return false;
  return true;
}

function OrderStageBadge({ order }) {
  const stage = getBuyerOrderStage(order);
  return <span className={`badge badge-status badge-${stage}`}>{STAGE_LABELS[stage]}</span>;
}

function ProductCell({ order }) {
  return (
    <div className="order-cell-with-thumb">
      {order.productImageUrl ? (
        <img src={order.productImageUrl} alt="" className="order-cell-thumb" />
      ) : (
        <span className="order-cell-thumb order-cell-thumb-fallback"><Package size={16} /></span>
      )}
      <div>
        <div className="order-cell-main">{order.productName}</div>
        <div className="order-cell-sub">{order.quantity} {order.unit}</div>
      </div>
    </div>
  );
}

function FarmerCell({ order }) {
  return (
    <div className="order-cell-with-thumb">
      <span className="farmer-list-avatar order-cell-avatar">{getInitials(order.farmerName)}</span>
      <strong>{order.farmerName}</strong>
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

// Every action here maps directly to a real, already-secured backend endpoint — Track/View
// Details both open the same full order page (OrderTracking.jsx), which already has its own
// ownership check, live tracking map, payment/delivery breakdown, and rating flow; there is
// nothing this list page needs to duplicate. Exactly one action set per stage, matching the
// brief's own state table, never every button at once.
function OrderActions({ order, onCancel, onConfirmReceived }) {
  const stage = getBuyerOrderStage(order);

  if (stage === 'cancelled' || stage === 'rejected') {
    return <Link className="btn btn-secondary btn-sm" to={`/orders/${order.id}`}><Eye size={14} /> View Details</Link>;
  }

  if (stage === 'completed') {
    return (
      <div className="table-actions">
        <Link className="btn btn-secondary btn-sm" to={`/orders/${order.id}`}><Eye size={14} /> View Details</Link>
        <Link className="btn btn-primary btn-sm" to={`/products/${order.productId}`}><RotateCcw size={14} /> Buy Again</Link>
      </div>
    );
  }

  if (stage === 'delivered') {
    return (
      <div className="table-actions">
        <Link className="btn btn-secondary btn-sm" to={`/orders/${order.id}`}><MapPin size={14} /> Track</Link>
        <Button size="sm" onClick={() => onConfirmReceived(order)}><CheckCircle2 size={14} /> Confirm Received</Button>
      </div>
    );
  }

  // pending / confirmed / preparing / ready_for_pickup / out_for_delivery
  return (
    <div className="table-actions">
      <Link className="btn btn-secondary btn-sm" to={`/orders/${order.id}`}><MapPin size={14} /> Track</Link>
      {canPayNow(order) ? (
        <Link className="btn btn-primary btn-sm" to={`/orders/${order.id}/pay/gcash`}><CreditCard size={14} /> Pay Now</Link>
      ) : null}
      {isCancellable(order) ? (
        <Button size="sm" variant="danger" onClick={() => onCancel(order)}><X size={14} /> Cancel</Button>
      ) : null}
    </div>
  );
}

export default function BuyerOrders() {
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const navItems = getNavItemsForRole(currentUser.role);
  const [orders, setOrders] = useState([]);
  const [cancelTarget, setCancelTarget] = useState(null);

  const [activeStage, setActiveStage] = useState('all');
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const reload = () => getOrdersByBuyer(currentUser.id).then(setOrders);

  useEffect(() => {
    if (location.state?.notice) showToast({ type: 'success', message: location.state.notice });
    reload();
    const interval = setInterval(reload, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const run = async (action, successMessage) => {
    try {
      await action();
      showToast({ type: 'success', message: successMessage });
      reload();
    } catch (actionError) {
      showToast({ type: 'error', message: actionError.message });
    }
  };

  const confirmCancel = () => {
    if (!cancelTarget) return;
    run(() => cancelOrder(cancelTarget.id), 'Order cancelled.');
    setCancelTarget(null);
  };

  const summary = useMemo(() => {
    const counts = { total: orders.length, pending: 0, toReceive: 0, completed: 0, cancelled: 0 };
    orders.forEach((order) => {
      const stage = getBuyerOrderStage(order);
      if (stage === 'pending') counts.pending += 1;
      else if (['preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered'].includes(stage)) counts.toReceive += 1;
      else if (stage === 'completed') counts.completed += 1;
      else if (stage === 'cancelled' || stage === 'rejected') counts.cancelled += 1;
    });
    return counts;
  }, [orders]);

  const stageCounts = useMemo(() => {
    const counts = { all: orders.length };
    STAGE_TABS.forEach((tab) => { if (tab.key !== 'all') counts[tab.key] = 0; });
    orders.forEach((order) => {
      const stage = getBuyerOrderStage(order);
      if (stage in counts) counts[stage] += 1;
    });
    return counts;
  }, [orders]);

  const hasActiveFilters = activeStage !== 'all' || search.trim() || paymentFilter !== 'all' || fromDate || toDate;

  const clearFilters = () => {
    setActiveStage('all');
    setSearch('');
    setPaymentFilter('all');
    setFromDate('');
    setToDate('');
  };

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (activeStage !== 'all' && getBuyerOrderStage(order) !== activeStage) return false;
      if (paymentFilter !== 'all' && order.paymentStatus !== paymentFilter) return false;
      if (!isWithinDateRange(order, fromDate, toDate)) return false;
      if (query) {
        const haystack = `${order.farmerName} ${order.productName} ${shortOrderId(order.id)} ${order.id}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [orders, activeStage, search, paymentFilter, fromDate, toDate]);

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title="My Orders"
      subtitle="Track payment and delivery status for every order you've placed."
    >
      {orders.length ? (
        <div className="order-stats-bar">
          <div className="product-stats-item">
            <div className="product-stats-label-row"><p className="product-stats-label">Total Orders</p></div>
            <p className="product-stats-value">{summary.total}</p>
          </div>
          <div className="product-stats-item accent-warning">
            <div className="product-stats-label-row"><p className="product-stats-label">Pending</p></div>
            <p className="product-stats-value">{summary.pending}</p>
          </div>
          <div className="product-stats-item accent-info">
            <div className="product-stats-label-row"><p className="product-stats-label">To Receive</p></div>
            <p className="product-stats-value">{summary.toReceive}</p>
          </div>
          <div className="product-stats-item accent-success">
            <div className="product-stats-label-row"><p className="product-stats-label">Completed</p></div>
            <p className="product-stats-value">{summary.completed}</p>
          </div>
          <div className="product-stats-item accent-danger">
            <div className="product-stats-label-row"><p className="product-stats-label">Cancelled</p></div>
            <p className="product-stats-value">{summary.cancelled}</p>
          </div>
        </div>
      ) : null}

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">History</p>
            <h2>Order history</h2>
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
                  placeholder="Search by product, farmer, or order ID..."
                  aria-label="Search orders by product, farmer, or order ID"
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
                <label className="order-toolbar-date">
                  From
                  <input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} aria-label="From date" />
                </label>
                <label className="order-toolbar-date">
                  To
                  <input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} aria-label="To date" />
                </label>
                {hasActiveFilters ? (
                  <button type="button" className="order-toolbar-reset" onClick={clearFilters}>Clear filters</button>
                ) : null}
              </div>
            </div>

            {filteredOrders.length ? (
              <>
                <div className="order-table-wrap table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Farmer</th>
                        <th>Payment</th>
                        <th>Order Status</th>
                        <th>Updated</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((order) => (
                        <tr key={order.id}>
                          <td><ProductCell order={order} /></td>
                          <td><FarmerCell order={order} /></td>
                          <td><PaymentCell order={order} /></td>
                          <td><OrderStageBadge order={order} /></td>
                          <td><span className="muted">{formatDate(order.updatedAt)}</span></td>
                          <td>
                            <OrderActions
                              order={order}
                              onCancel={setCancelTarget}
                              onConfirmReceived={(target) => run(() => advanceDelivery(target.id), 'The order is received! Thank you for confirming.')}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="order-mobile-cards">
                  {filteredOrders.map((order) => (
                    <div key={order.id} className="order-mobile-card">
                      <div className="order-mobile-card-top">
                        <span className="order-mobile-card-buyer">{order.farmerName}</span>
                        <span className="order-mobile-card-date">{formatDate(order.updatedAt)}</span>
                      </div>

                      <ProductCell order={order} />

                      <div className="order-mobile-card-grid">
                        <div>
                          <p className="order-mobile-card-label">Payment</p>
                          <p className="order-mobile-card-value">{paymentLabel(order.paymentMethod)}</p>
                          <StatusBadge value={order.paymentStatus} type="paymentStatus" />
                        </div>
                        <div>
                          <p className="order-mobile-card-label">Total</p>
                          <p className="order-mobile-card-value">{formatCurrency(order.totalAmount)}</p>
                        </div>
                      </div>

                      <div>
                        <p className="order-mobile-card-label">Status</p>
                        <div className="mt-1"><OrderStageBadge order={order} /></div>
                      </div>

                      <div className="order-mobile-card-actions">
                        <OrderActions
                          order={order}
                          onCancel={setCancelTarget}
                          onConfirmReceived={(target) => run(() => advanceDelivery(target.id), 'The order is received! Thank you for confirming.')}
                        />
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
          <EmptyState
            icon={ClipboardList}
            title="No Orders Yet"
            message="You haven't placed any orders yet. Start shopping from our marketplace and your orders will appear here."
            actionLabel="Browse Products"
            onAction={() => navigate('/marketplace')}
          />
        )}
      </section>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel Order?"
        message="Are you sure you want to cancel this order? This action cannot be undone."
        confirmLabel="Yes, Cancel Order"
        cancelLabel="Keep Order"
        onConfirm={confirmCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </AppShell>
  );
}
