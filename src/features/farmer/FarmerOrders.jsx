import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, CheckCircle2, ChevronRight, Clipboard, ClipboardList, MapPin, Navigation, Package, Receipt, Search, Truck, X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import PaymentMethodLabel from '../../components/common/PaymentMethodLabel';
import StartDeliveryDialog from '../../components/orders/StartDeliveryDialog';
import PaymentVerificationDrawer from '../../components/orders/PaymentVerificationDrawer';
import OrderStatusSummary from '../../components/orders/OrderStatusSummary';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { advanceDelivery, getNextDeliveryStatus, getOrdersByFarmer, updateOrderStatus } from '../../services/orderService';
import { approvePaymentVerification, rejectPaymentVerification } from '../../services/paymentService';
import { formatCurrency, formatDate, formatTime, deliveryMethodLabel, getInitials, shortOrderId } from '../../utils/formatters';
import { farmerNavItems } from './farmerNav';
import './FarmerOrders.css';






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



const VISIBLE_VERIFICATION_LIMIT = 5;

const STAGE_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready_for_pickup: 'Ready for pickup',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};




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
  { value: 'exact', label: 'Exact date & time' },
];

function isWithinDateFilter(order, dateFilter, exactDateTime) {
  if (dateFilter === 'all') return true;
  if (dateFilter === 'exact') {
    if (!exactDateTime) return true;
    const createdAt = new Date(order.createdAt);
    if (Number.isNaN(createdAt.getTime())) return false;
    const selectedTime = new Date(exactDateTime).getTime();
    const minuteInMs = 60 * 1000;
    return createdAt.getTime() >= selectedTime && createdAt.getTime() < selectedTime + minuteInMs;
  }
  const created = new Date(order.createdAt).getTime();
  const days = dateFilter === 'today' ? 1 : dateFilter === '7d' ? 7 : 30;
  return Date.now() - created <= days * 24 * 60 * 60 * 1000;
}




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



    if (order.deliveryMethod === 'courier') return { kind: 'book-courier' };
    return { kind: 'advance', next: nextStep, label: 'Start Delivery' };
  }





  if (nextStep === 'picked_up' || nextStep === 'delivered') {
    return { kind: 'awaiting-buyer' };
  }
  return { kind: 'view' };
}

function OrderStageBadge({ order }) {
  const stage = getOrderStage(order);
  return <span className={`farmer-order-stage stage-${stage}`}>{stage === 'completed' ? <Check size={14} aria-hidden="true" /> : null}{stage === 'pending' ? 'Waiting for your confirmation' : STAGE_LABELS[stage]}</span>;
}

function BuyerCell({ order }) {
  return (
    <div className="order-cell-with-thumb order-farmer-cell">
      <span className="farmer-list-avatar order-cell-avatar">
        {order.buyerAvatarUrl ? <img src={order.buyerAvatarUrl} alt="" /> : getInitials(order.buyerName)}
      </span>
      <div>
        <strong>{order.buyerName}</strong>
      </div>
    </div>
  );
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
        <div className="farmer-order-quantity">{order.quantity} {order.unit} ordered</div>
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

function PaymentCell({ order, onViewPayment }) {
  return (
    <div className="order-payment-cell">
      <div className="order-cell-main"><PaymentMethodLabel method={order.paymentMethod} /></div>
      {order.paymentMethod === 'gcash' ? (
        <span className="order-cell-sub">{({ pending: 'Awaiting verification', approved: 'Payment verified', rejected: 'Payment rejected' })[order.paymentVerificationStatus] || ({ paid: 'Paid', pending: 'Payment pending', refunded: 'Refunded' })[order.paymentStatus] || order.paymentStatus}</span>
      ) : null}
      <button
        type="button"
        className="order-payment-info-btn"
        onClick={() => onViewPayment(order)}
        title="Payment information"
        aria-label={`Payment information for order ${shortOrderId(order.id)}`}
      >
        <Receipt size={14} aria-hidden="true" /> Payment info
      </button>
    </div>
  );
}

function DeliveryCell({ order }) {
  const stage = getOrderStage(order);
  return (
    <div>
      <div className="farmer-order-delivery">{order.deliveryMethod === 'buyer_pickup' ? <MapPin size={15} aria-hidden="true" /> : <Truck size={15} aria-hidden="true" />}{deliveryMethodLabel(order.deliveryMethod)}</div>
      {stage === 'out_for_delivery' ? <div className="order-cell-sub">In transit</div> : null}
    </div>
  );
}









function OrderActions({ order, onAction, onReviewPayment }) {
  const action = getPrimaryAction(order);
  const paymentAction = order.paymentVerificationStatus === 'pending' ? (
    <Button size="sm" variant="ghost" className="farmer-order-action farmer-order-action-review" onClick={() => onReviewPayment(order)}>
      <Receipt size={14} aria-hidden="true" /> Review payment
    </Button>
  ) : null;

  if (action.kind === 'confirm') {
    return (
      <div className="farmer-order-actions">
        {paymentAction}
        <Button size="sm" variant="ghost" className="farmer-order-action farmer-order-action-reject" onClick={() => onAction('reject', order)} aria-label={`Reject order from ${order.buyerName}`}>
          Reject
        </Button>
        <Button size="sm" className="farmer-order-action farmer-order-action-primary" onClick={() => onAction('confirm', order)} aria-label={`Confirm order from ${order.buyerName}`}>
          <Check size={16} aria-hidden="true" /> Confirm order
        </Button>
      </div>
    );
  }

  if (action.kind === 'book-courier') {
    if (!paymentAction) {
      return (
        <Link className="farmer-order-action farmer-order-action-primary" to={`/orders/${order.id}`}>
          <Truck size={14} aria-hidden="true" /> Book with Lalamove
        </Link>
      );
    }
    return (
      <div className="farmer-order-actions">
        {paymentAction}
        <Link className="farmer-order-action farmer-order-action-primary" to={`/orders/${order.id}`}>
          <Truck size={14} aria-hidden="true" /> Book with Lalamove
        </Link>
      </div>
    );
  }

  if (action.kind === 'advance') {
    return (
      <div className="farmer-order-actions">
        {paymentAction}
        <Button
          size="sm"
          className="farmer-order-action farmer-order-action-primary"
          onClick={() => onAction('advance', order, action)}
        >
          {action.label === 'Start Delivery' ? <Navigation size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />} {action.label}
        </Button>
        {getOrderStage(order) === 'out_for_delivery' ? (
          <Link className="farmer-order-action farmer-order-action-link" to={`/orders/${order.id}`}>
            <MapPin size={14} aria-hidden="true" /> Track delivery
          </Link>
        ) : null}
      </div>
    );
  }

  if (action.kind === 'awaiting-buyer') {
    return (
      <div className="farmer-order-actions">
        {paymentAction}
        <span className="farmer-order-action-note">Awaiting buyer confirmation</span>
        {getOrderStage(order) === 'out_for_delivery' ? (
          <Link className="farmer-order-action farmer-order-action-link" to={`/orders/${order.id}`}>
            <MapPin size={14} aria-hidden="true" /> Track delivery
          </Link>
        ) : (
          <Link className="farmer-order-action farmer-order-action-link" to={`/orders/${order.id}`}>View details <ChevronRight size={14} aria-hidden="true" /></Link>
        )}
      </div>
    );
  }

  if (!paymentAction) {
    return <Link className="farmer-order-action farmer-order-action-link" to={`/orders/${order.id}`}>View details <ChevronRight size={14} aria-hidden="true" /></Link>;
  }

  return (
    <div className="farmer-order-actions">
      {paymentAction}
      <Link className="farmer-order-action farmer-order-action-link" to={`/orders/${order.id}`}>View details <ChevronRight size={14} aria-hidden="true" /></Link>
    </div>
  );
}

function PaymentVerificationList({ orders, onReview }) {
  return (
    <div className="payment-verification-list">
      {orders.map((order) => (
        <button key={order.id} type="button" className="payment-verification-row" onClick={() => onReview(order)}>
          <span className="payment-verification-row-main">
            <strong>{order.buyerName}</strong>
            <span className="muted">Order #{shortOrderId(order.id)} &middot; Ref {order.paymentReferenceNumber || 'Not provided'} &middot; {formatDate(order.paymentSubmittedAt)}</span>
          </span>
          <span className="payment-verification-row-amount">{formatCurrency(order.totalAmount)}</span>
          <span className="payment-verification-row-cta">Review <ChevronRight size={15} aria-hidden="true" /></span>
        </button>
      ))}
    </div>
  );
}

function PaymentListDialog({ open, orders, onClose, onReview }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={dialogRef} className="payment-verification-dialog" aria-labelledby="payment-list-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="payment-verification-dialog-heading">
        <div><h2 id="payment-list-title">Payment verification</h2><span className="payment-verification-pending">{orders.length} pending</span></div>
        <button type="button" className="payment-verification-close" onClick={onClose} aria-label="Close payments" title="Close payments" autoFocus><X size={20} aria-hidden="true" /></button>
      </div>
      <PaymentVerificationList orders={orders} onReview={onReview} />
    </dialog>
  );
}

function ConfirmPurchaseDialog({ order, onCancel, onConfirm, submitting }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (order && !dialog.open) dialog.showModal();
    if (!order && dialog.open) dialog.close();
  }, [order]);

  return (
    <dialog ref={dialogRef} className="farmer-confirm-dialog" aria-labelledby="confirm-purchase-title" aria-describedby="confirm-purchase-description"
      onCancel={(event) => { event.preventDefault(); if (!submitting) onCancel(); }}
      onClick={(event) => { if (event.target === event.currentTarget && !submitting) onCancel(); }}>
      {order ? <div className="farmer-confirm-content" aria-busy={submitting}>
        <h2 id="confirm-purchase-title">Confirm this order?</h2>
        <p id="confirm-purchase-description" className="farmer-confirm-description">Review the order details before accepting.</p>
        <div className="farmer-confirm-product">
          {order.productImageUrl ? <img src={order.productImageUrl} alt="" /> : null}
          <div>
            <h3>{order.productName}</h3>
            <p>{order.quantity} {order.unit} <span aria-hidden="true">&middot;</span> {formatCurrency(order.totalAmount)}</p>
          </div>
        </div>
        <dl className="farmer-confirm-summary">
          <div className="farmer-confirm-buyer"><dt>Buyer</dt><dd>{order.buyerName}</dd></div>
          <div><dt>Payment</dt><dd><PaymentMethodLabel method={order.paymentMethod} /></dd></div>
          <div><dt>Delivery</dt><dd>{deliveryMethodLabel(order.deliveryMethod)}</dd></div>
        </dl>
        <div className="farmer-confirm-total"><span>Order total</span><strong>{formatCurrency(order.totalAmount)}</strong></div>
        <div className="farmer-confirm-actions">
          <Button variant="secondary" onClick={onCancel} disabled={submitting} autoFocus>Cancel</Button>
          <Button onClick={onConfirm} disabled={submitting}><Check size={16} aria-hidden="true" />{submitting ? 'Confirming...' : 'Confirm order'}</Button>
        </div>
      </div> : null}
    </dialog>
  );
}

export default function FarmerOrders() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [rejectTarget, setRejectTarget] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [startDeliveryOrder, setStartDeliveryOrder] = useState(null);
  const [verifyingOrderId, setVerifyingOrderId] = useState(null);
  const [showAllVerifications, setShowAllVerifications] = useState(false);
  const [copiedOrderId, setCopiedOrderId] = useState(null);

  const [activeStage, setActiveStage] = useState('all');
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [deliveryFilter, setDeliveryFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [exactDateTime, setExactDateTime] = useState('');

  const reload = () => getOrdersByFarmer(currentUser.id).then(setOrders);

  useEffect(() => {
    reload();
    const interval = setInterval(reload, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const run = async (action, successMessage, nextStage) => {
    try {
      await action();
      setError('');
      showToast({ type: 'success', message: successMessage });
      await reload();
      if (nextStage) setActiveStage(nextStage);
      return true;
    } catch (actionError) {
      showToast({ type: 'error', message: actionError.message });
      return false;
    }
  };

  const handleAction = (type, order, action) => {
    if (type === 'confirm') {
      setConfirmTarget(order);
      return;
    }
    if (type === 'reject') {
      setRejectTarget(order);
      return;
    }
    if (type === 'advance') {
      if (action.next === 'out_for_delivery' && order.deliveryMethod === 'farmer_delivery') {
        setStartDeliveryOrder(order);
        return;
      }
      if (action.requiresConfirm) {
        setConfirmAction({ order, action });
        return;
      }
      run(
        () => advanceDelivery(order.id),
        `Order marked "${action.label}".`,
        getOrderStage({ ...order, deliveryStatus: action.next }),
      );
    }
  };

  const confirmReject = () => {
    if (!rejectTarget) return;
    run(() => updateOrderStatus(rejectTarget.id, 'rejected'), 'Order rejected.');
    setRejectTarget(null);
  };

  const confirmPurchase = async () => {
    if (!confirmTarget || confirming) return;
    setConfirming(true);
    const confirmed = await run(() => updateOrderStatus(confirmTarget.id, 'confirmed'), 'Order confirmed.');
    if (confirmed) setActiveStage('confirmed');
    setConfirming(false);
    setConfirmTarget(null);
  };

  const confirmAdvance = () => {
    if (!confirmAction) return;
    const { order, action } = confirmAction;
    run(
      () => advanceDelivery(order.id),
      `Order marked "${action.label}".`,
      getOrderStage({ ...order, deliveryStatus: action.next }),
    );
    setConfirmAction(null);
  };

  const confirmStartDelivery = (plateNumber) => {
    if (!startDeliveryOrder) return;
    const target = startDeliveryOrder;
    setStartDeliveryOrder(null);
    run(
      () => advanceDelivery(target.id, plateNumber),
      'Order marked "Out for Delivery".',
      'out_for_delivery',
    );
  };



  const handleApprovePayment = async (order) => {
    await run(() => approvePaymentVerification(order.id), 'Payment approved.');
    setVerifyingOrderId(null);
  };

  const handleRejectPayment = async (order, reason) => {
    await run(() => rejectPaymentVerification(order.id, reason), 'Payment rejected.');
    setVerifyingOrderId(null);
  };



  const pendingVerifications = orders.filter((order) => order.paymentVerificationStatus === 'pending');




  const verifyingOrder = orders.find((order) => order.id === verifyingOrderId) || null;


  const visibleVerifications = pendingVerifications.slice(0, VISIBLE_VERIFICATION_LIMIT);

  const reviewPayment = (order) => {
    setShowAllVerifications(false);
    setVerifyingOrderId(order.id);
  };

  const stageCounts = useMemo(() => {
    const counts = { all: orders.length };
    STAGE_TABS.forEach((tab) => { if (tab.key !== 'all') counts[tab.key] = 0; });
    orders.forEach((order) => {
      const stage = getOrderStage(order);
      if (stage in counts) counts[stage] += 1;
    });
    return counts;
  }, [orders]);

  const copyOrderId = async (id) => {
    try {
      await navigator.clipboard.writeText(`#HL-${shortOrderId(id)}`);
      setCopiedOrderId(id);
      window.setTimeout(() => setCopiedOrderId((current) => (current === id ? null : current)), 1800);
    } catch {
      showToast({ type: 'error', message: 'Unable to copy the order ID.' });
    }
  };

  const hasActiveFilters = activeStage !== 'all' || search.trim() || paymentFilter !== 'all' || deliveryFilter !== 'all' || dateFilter !== 'all';

  const clearFilters = () => {
    setActiveStage('all');
    setSearch('');
    setPaymentFilter('all');
    setDeliveryFilter('all');
    setDateFilter('all');
    setExactDateTime('');
  };

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (activeStage === 'to_prepare') {
        if (!['confirmed', 'preparing'].includes(getOrderStage(order))) return false;
      } else if (activeStage !== 'all' && getOrderStage(order) !== activeStage) return false;
      if (paymentFilter !== 'all' && order.paymentStatus !== paymentFilter) return false;
      if (deliveryFilter !== 'all' && order.deliveryMethod !== deliveryFilter) return false;
      if (!isWithinDateFilter(order, dateFilter, exactDateTime)) return false;
      if (query) {
        const haystack = `${order.buyerName} ${order.productName} #HL-${shortOrderId(order.id)} #${order.id}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    }).sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'));
  }, [orders, activeStage, search, paymentFilter, deliveryFilter, dateFilter, exactDateTime]);

  return (
    <AppShell
      user={currentUser}
      navItems={farmerNavItems}
      eyebrow="Order management"
      title="Purchase Orders"
      subtitle="Review and process customer orders from confirmation to completion."
      pageClassName="farmer-orders-page"
    >
      {error ? <div className="form-alert error">{error}</div> : null}

      {pendingVerifications.length ? (
        <section className="panel payment-verification-panel">
          <div className="payment-verification-heading">
            <div className="payment-verification-heading-main">
              <div className="payment-verification-title-row">
                <h2>Payment verification</h2>
                <span className="payment-verification-pending">{pendingVerifications.length} pending</span>
              </div>
              <p className="payment-verification-subtitle">Review payments that still need confirmation.</p>
            </div>
            <button type="button" className="payment-verification-view" onClick={() => setShowAllVerifications(true)}>
              View payments <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>

          <PaymentVerificationList orders={visibleVerifications} onReview={reviewPayment} />
          {pendingVerifications.length > VISIBLE_VERIFICATION_LIMIT ? (
            <p className="payment-verification-limit">Showing {VISIBLE_VERIFICATION_LIMIT} of {pendingVerifications.length} pending payments</p>
          ) : null}
        </section>
      ) : null}

      <section className="farmer-orders-workspace" aria-label="Purchase orders">
        {orders.length ? (
          <>
            {stageCounts.pending ? (
              <div className="farmer-orders-attention">
                <div><h2>Needs your attention</h2><p>{stageCounts.pending} {stageCounts.pending === 1 ? 'order' : 'orders'} waiting for confirmation</p></div>
                <Button variant="secondary" onClick={() => { clearFilters(); setActiveStage('pending'); }}>Review pending <ChevronRight size={16} aria-hidden="true" /></Button>
              </div>
            ) : null}
            <OrderStatusSummary stageCounts={stageCounts} activeStage={activeStage} onSelectStage={setActiveStage} />

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
                  <span className={`filter-tab-count${stageCounts[tab.key] ? '' : ' is-zero'}`}>
                    {stageCounts[tab.key] || 0}
                  </span>
                </button>
              ))}
            </div>

            <div className="order-toolbar">
              <label className="search-field order-toolbar-search">
                <Search size={15} className="text-[var(--muted)]" aria-hidden="true" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Order ID, buyer or product"
                  aria-label="Search orders by order ID, buyer or product"
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
                  onChange={(event) => {
                    setDateFilter(event.target.value);
                    if (event.target.value !== 'exact') setExactDateTime('');
                  }}
                  aria-label="Filter by date"
                >
                  {DATE_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                {dateFilter === 'exact' ? (
                  <input
                    className="order-toolbar-select order-toolbar-exact-date"
                    type="datetime-local"
                    value={exactDateTime}
                    onChange={(event) => setExactDateTime(event.target.value)}
                    aria-label="Choose exact order date and time"
                  />
                ) : null}
                {hasActiveFilters ? (
                  <button type="button" className="order-toolbar-reset" onClick={clearFilters}>Clear filters</button>
                ) : null}
              </div>
            </div>

            {filteredOrders.length ? (
              <div className="farmer-purchase-list" role="list" aria-label="Orders">
                {filteredOrders.map((order) => (
                  <article key={order.id} role="listitem" className={`farmer-purchase-row${order.status === 'pending' ? ' is-pending' : ''}${getOrderStage(order) === 'completed' ? ' is-completed' : ''}`} aria-label={`Order from ${order.buyerName}: ${order.productName}`}>
                    <div className="farmer-purchase-buyer">
                      <BuyerCell order={order} />
                      <OrderIdCell order={order} copiedOrderId={copiedOrderId} onCopy={copyOrderId} />
                    </div>
                    <div className="farmer-purchase-summary">
                      <div className="farmer-purchase-product">
                        <ProductCell order={order} />
                        <div className="farmer-purchase-total"><span>Order total</span><strong>{formatCurrency(order.totalAmount)}</strong></div>
                      </div>
                      <div className="farmer-purchase-logistics">
                        <PaymentCell order={order} onViewPayment={(target) => setVerifyingOrderId(target.id)} />
                        <DeliveryCell order={order} />
                      </div>
                      <time className="farmer-purchase-date" dateTime={order.createdAt}>{formatDate(order.createdAt)} &middot; {formatTime(order.createdAt)}</time>
                    </div>
                    <div className="farmer-purchase-decision">
                      <OrderStageBadge order={order} />
                      <OrderActions order={order} onAction={handleAction} onReviewPayment={(target) => setVerifyingOrderId(target.id)} />
                      {order.status === 'pending' ? <Link className="farmer-purchase-details" to={`/orders/${order.id}`}>View details <ChevronRight size={14} aria-hidden="true" /></Link> : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Package}
                title="No matching orders"
                message="Try a different search term or clear your filters."
                actionLabel={hasActiveFilters ? 'Clear filters' : undefined}
                onAction={clearFilters}
                compact
              />
            )}
          </>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="No purchase orders yet"
            message="When buyers place orders for your products, they'll appear here."
            compact
          />
        )}
      </section>

      <ConfirmPurchaseDialog order={confirmTarget} onCancel={() => setConfirmTarget(null)} onConfirm={confirmPurchase} submitting={confirming} />

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

      <StartDeliveryDialog
        open={Boolean(startDeliveryOrder)}
        onConfirm={confirmStartDelivery}
        onCancel={() => setStartDeliveryOrder(null)}
      />

      <PaymentListDialog open={showAllVerifications} orders={pendingVerifications} onClose={() => setShowAllVerifications(false)} onReview={reviewPayment} />

      <PaymentVerificationDrawer
        order={verifyingOrder}
        onClose={() => setVerifyingOrderId(null)}
        onApprove={handleApprovePayment}
        onReject={handleRejectPayment}
      />
    </AppShell>
  );
}
