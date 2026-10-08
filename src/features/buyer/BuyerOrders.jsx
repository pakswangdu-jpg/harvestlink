import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BadgeCheck, CalendarDays, CheckCircle2, CircleCheck, CircleX, Clipboard, ClipboardList,
  Clock3, CreditCard, Eye, MapPin, Package, RotateCcw, Search, ShoppingBag, Truck, X,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import PaymentMethodLabel from '../../components/common/PaymentMethodLabel';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { advanceDelivery, cancelOrder, getOrdersByBuyer, isCancellable } from '../../services/orderService';
import { ONLINE_PAYMENT_METHODS } from '../../utils/constants';
import {
  formatCurrency, formatDate, formatTime, getInitials, shortOrderId,
} from '../../utils/formatters';
import { getNavItemsForRole } from '../../utils/navItemsByRole';
import './BuyerOrdersSummary.css';






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

const ORDERS_PER_PAGE = 10;

const ORDER_OVERVIEW_FILTERS = [
  { key: 'all', label: 'Total Orders', hint: 'All purchases', icon: ShoppingBag },
  { key: 'pending', label: 'Pending', hint: 'Needs confirmation', icon: Clock3 },
  { key: 'to_receive', label: 'To Receive', hint: 'Orders on the way', icon: Truck },
  { key: 'completed', label: 'Completed', hint: 'Orders received', icon: CircleCheck },
  { key: 'cancelled', label: 'Cancelled', hint: 'Cancelled orders', icon: CircleX },
];




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
    <div className="order-cell-with-thumb order-farmer-cell">
      <span className="farmer-list-avatar order-cell-avatar">
        {order.farmerAvatarUrl ? <img src={order.farmerAvatarUrl} alt="" /> : getInitials(order.farmerName)}
      </span>
      <div>
        <strong>{order.farmerName}</strong>
        {order.farmerFarmName ? <div className="order-cell-sub">{order.farmerFarmName}</div> : null}
        {order.farmerVerificationStatus === 'verified' ? (
          <span className="order-verified"><BadgeCheck size={13} /> Verified</span>
        ) : null}
      </div>
    </div>
  );
}

function OrderIdCell({ order, copiedOrderId, onCopy }) {
  const label = `#HL-${shortOrderId(order.id)}`;
  return (
    <div className="order-id-cell">
      <span className="order-id">{label}</span>
      <button
        type="button"
        className="order-copy-button"
        onClick={() => onCopy(order.id)}
        aria-label={`Copy order ID ${label}`}
        title={copiedOrderId === order.id ? 'Copied' : 'Copy order ID'}
      >
        {copiedOrderId === order.id ? <CheckCircle2 size={15} /> : <Clipboard size={15} />}
      </button>
      {copiedOrderId === order.id ? <span className="order-copy-confirmation">Copied</span> : null}
    </div>
  );
}

function PaymentCell({ order }) {
  return (
    <div className="order-cell-main"><PaymentMethodLabel method={order.paymentMethod} /></div>
  );
}






function OrderActionButton({ to, variant = 'secondary', icon: Icon, children, ...props }) {
  const content = <><Icon size={16} aria-hidden="true" /><span>{children}</span></>;
  return to ? (
    <Link to={to} className={`btn btn-${variant} order-action-button`} {...props}>{content}</Link>
  ) : (
    <Button variant={variant} className="order-action-button" {...props}>{content}</Button>
  );
}

function OrderActions({ order, onCancel, onConfirmReceived }) {
  const stage = getBuyerOrderStage(order);

  if (stage === 'cancelled' || stage === 'rejected') {
    return <div className="order-actions"><OrderActionButton to={`/orders/${order.id}`} icon={Eye}>View Details</OrderActionButton></div>;
  }

  if (stage === 'completed') {
    return (
      <div className="order-actions">
        <OrderActionButton to={`/orders/${order.id}`} icon={Eye}>View Details</OrderActionButton>
        <OrderActionButton variant="ghost" to={`/products/${order.productId}`} icon={RotateCcw}>Buy Again</OrderActionButton>
      </div>
    );
  }

  if (stage === 'delivered') {
    return (
      <div className="order-actions">
        <OrderActionButton to={`/orders/${order.id}`} icon={MapPin}>Track</OrderActionButton>
        <OrderActionButton variant="primary" icon={CheckCircle2} onClick={() => onConfirmReceived(order)}>Confirm Received</OrderActionButton>
      </div>
    );
  }


  return (
    <div className="order-actions">
      <OrderActionButton to={`/orders/${order.id}`} icon={MapPin}>Track</OrderActionButton>
      {canPayNow(order) ? (
        <OrderActionButton variant="primary" to={`/orders/${order.id}/pay/gcash`} icon={CreditCard}>Pay Now</OrderActionButton>
      ) : null}
      {isCancellable(order) ? (
        <OrderActionButton variant="danger" icon={X} onClick={() => onCancel(order)}>Cancel</OrderActionButton>
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
  const [overviewFilter, setOverviewFilter] = useState('all');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [copiedOrderId, setCopiedOrderId] = useState(null);
  const orderHistoryRef = useRef(null);

  const requestedStage = location.state?.stage;
  const requestedPaymentFilter = location.state?.paymentFilter;
  const [activeStage, setActiveStage] = useState(
    STAGE_TABS.some((tab) => tab.key === requestedStage) ? requestedStage : 'all'
  );
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState(
    PAYMENT_FILTER_OPTIONS.some((option) => option.value === requestedPaymentFilter) ? requestedPaymentFilter : 'all'
  );
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

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

  const hasActiveFilters = overviewFilter !== 'all' || activeStage !== 'all' || search.trim() || paymentFilter !== 'all' || fromDate || toDate;

  const clearFilters = () => {
    setOverviewFilter('all');
    setActiveStage('all');
    setSearch('');
    setPaymentFilter('all');
    setFromDate('');
    setToDate('');
    setCurrentPage(1);
  };

  const selectOverviewFilter = (filter) => {
    setOverviewFilter(filter);
    setActiveStage('all');
    setSearch('');
    setPaymentFilter('all');
    setFromDate('');
    setToDate('');
    setCurrentPage(1);
    orderHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const copyOrderId = async (id) => {
    try {
      await navigator.clipboard.writeText(`#HL-${shortOrderId(id)}`);
      setCopiedOrderId(id);
      window.setTimeout(() => setCopiedOrderId((current) => (current === id ? null : current)), 1800);
    } catch {
      showToast({ type: 'error', message: 'Unable to copy the order ID.' });
    }
  };

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      const stage = getBuyerOrderStage(order);
      if (overviewFilter === 'pending' && stage !== 'pending') return false;
      if (overviewFilter === 'to_receive' && !['preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered'].includes(stage)) return false;
      if (overviewFilter === 'completed' && stage !== 'completed') return false;
      if (overviewFilter === 'cancelled' && !['cancelled', 'rejected'].includes(stage)) return false;
      if (activeStage !== 'all' && getBuyerOrderStage(order) !== activeStage) return false;
      if (paymentFilter !== 'all' && order.paymentStatus !== paymentFilter) return false;
      if (!isWithinDateRange(order, fromDate, toDate)) return false;
      if (query) {
        const haystack = `${order.farmerName} ${order.productName} ${shortOrderId(order.id)} ${order.id}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [orders, overviewFilter, activeStage, search, paymentFilter, fromDate, toDate]);

  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PER_PAGE));
  const visiblePage = Math.min(currentPage, pageCount);
  const paginatedOrders = filteredOrders.slice(
    (visiblePage - 1) * ORDERS_PER_PAGE,
    visiblePage * ORDERS_PER_PAGE,
  );

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title="My Orders"
      subtitle="Track payment and delivery status for every order you've placed."
      pageClassName="buyer-orders-page"
    >
      {orders.length ? (
        <section className="buyer-order-overview" aria-labelledby="buyer-order-overview-title">
          <div className="buyer-order-overview-heading">
            <p className="eyebrow">ORDER OVERVIEW</p>
            <h2 id="buyer-order-overview-title">Order Overview</h2>
            <p>Track and manage your recent orders</p>
          </div>
          <div className="buyer-orders-summary" aria-label="Filter orders by overview status">
            {ORDER_OVERVIEW_FILTERS.map(({ key, label, hint, icon: Icon }) => (
              <button
                key={key}
                type="button"
                className={`buyer-orders-summary-item is-${key}${overviewFilter === key ? ' is-selected' : ''}`}
                aria-pressed={overviewFilter === key}
                onClick={() => selectOverviewFilter(key)}
              >
                <span className="buyer-orders-summary-value">
                  {key === 'all' ? summary.total : summary[key === 'to_receive' ? 'toReceive' : key]}
                </span>
                <span className="buyer-orders-summary-label">
                  <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span>{label}</span>
                </span>
                <span className="buyer-orders-summary-hint">{hint}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel buyer-order-history" ref={orderHistoryRef} aria-labelledby="buyer-order-history-title">
        <div className="section-heading">
          <div>
            <h2 id="buyer-order-history-title">Order History</h2>
            <p>View and manage your previous and current orders.</p>
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
                  aria-selected={overviewFilter === 'all' && activeStage === tab.key}
                  className={`filter-tab ${overviewFilter === 'all' && activeStage === tab.key ? 'active' : ''}`}
                  onClick={() => {
                    setOverviewFilter('all');
                    setActiveStage(tab.key);
                    setCurrentPage(1);
                  }}
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
                  <span>From</span>
                  <input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} aria-label="From date" />
                </label>
                <label className="order-toolbar-date">
                  <span>To</span>
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
                        <th>Order ID</th>
                        <th>Payment</th>
                        <th>Order Status</th>
                        <th>Date</th>
                        <th>Total</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedOrders.map((order) => (
                        <tr key={order.id}>
                          <td><ProductCell order={order} /></td>
                          <td><FarmerCell order={order} /></td>
                          <td><OrderIdCell order={order} copiedOrderId={copiedOrderId} onCopy={copyOrderId} /></td>
                          <td><PaymentCell order={order} /></td>
                          <td><OrderStageBadge order={order} /></td>
                          <td>
                            <span className="order-date">
                              <span className="order-date-day"><CalendarDays size={14} />{formatDate(order.createdAt)}</span>
                              <span className="order-date-time">{formatTime(order.createdAt)}</span>
                            </span>
                          </td>
                          <td><strong className="order-total">{formatCurrency(order.totalAmount)}</strong></td>
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
                  {paginatedOrders.map((order) => (
                    <div key={order.id} className="order-mobile-card">
                      <div className="order-mobile-card-top">
                        <FarmerCell order={order} />
                        <span className="order-mobile-card-date">
                          <span className="order-date-day">{formatDate(order.createdAt)}</span>
                          <span className="order-date-time">{formatTime(order.createdAt)}</span>
                        </span>
                      </div>

                      <ProductCell order={order} />
                      <OrderIdCell order={order} copiedOrderId={copiedOrderId} onCopy={copyOrderId} />

                      <div className="order-mobile-card-grid">
                        <div>
                          <p className="order-mobile-card-label">Payment</p>
                          <p className="order-mobile-card-value"><PaymentMethodLabel method={order.paymentMethod} /></p>
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
                {pageCount > 1 ? (
                  <nav className="orders-pagination" aria-label="Order history pages">
                    <button
                      type="button"
                      className="orders-pagination-button"
                      disabled={visiblePage === 1}
                      onClick={() => setCurrentPage((page) => Math.max(1, Math.min(page, pageCount) - 1))}
                    >
                      Previous
                    </button>
                    <span className="orders-pagination-status">
                      Page {visiblePage} of {pageCount}
                    </span>
                    <button
                      type="button"
                      className="orders-pagination-button"
                      disabled={visiblePage === pageCount}
                      onClick={() => setCurrentPage((page) => Math.min(pageCount, Math.min(page, pageCount) + 1))}
                    >
                      Next
                    </button>
                  </nav>
                ) : null}
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
