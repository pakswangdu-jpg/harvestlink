import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, ExternalLink, RotateCw, Search } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import PageHeader from '../../components/admin/PageHeader';
import Table from '../../components/admin/Table';
import Pagination from '../../components/admin/Pagination';
import Modal from '../../components/admin/Modal';
import PaymentMethodLabel from '../../components/common/PaymentMethodLabel';
import { useAuth } from '../auth/AuthContext';
import { getAdminOrderPage, getOrderById } from '../../services/orderService';
import { getDelivery } from '../../services/deliveryService';
import { deliveryMethodLabel, deliveryStepLabel, formatCurrency, formatDate, formatTime, courierDeliveryStatusLabel } from '../../utils/formatters';
import { adminNavItems } from './adminNav';
import { ORDER_STATUSES, DELIVERY_STAGES, orderLabel, adminOrderId, progressLabel, paymentState, verificationState } from './adminOrderPresentation';
import './AdminOrders.css';

const EMPTY_FILTERS = { page: 1, search: '', status: '', deliveryStatus: '', paymentMethod: '', paymentStatus: '', deliveryMethod: '', from: '', to: '' };
const OVERVIEW = [['all', 'All orders'], ['pending', 'Pending'], ['confirmed', 'Confirmed'], ['preparing', 'Preparing'], ['out_for_delivery', 'Out for delivery'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['rejected', 'Rejected']];
const stamp = (date) => date ? `${formatDate(date)}, ${formatTime(date)}` : 'Not recorded';

function Status({ order }) { return <span className={`admin-order-status is-${order.status}`}>{orderLabel(order.status)}</span>; }
function Payment({ order }) { return <div><PaymentMethodLabel method={order.paymentMethod} /><small>{paymentState(order)}</small>{verificationState(order) ? <small className={order.paymentVerificationStatus === 'rejected' ? 'admin-order-warning' : ''}>{verificationState(order)}</small> : null}</div>; }
function DetailFields({ fields }) { return <dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? 'Not recorded'}</dd></div>)}</dl>; }

function OrderDetails({ id, onClose }) {
  const [record, setRecord] = useState(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const panel = document.querySelector('.admin-order-detail-modal [role="dialog"]');
    if (!panel) return undefined;
    const previousFocus = document.activeElement;
    panel.querySelector('button')?.focus();
    const trapFocus = (event) => {
      if (event.key !== 'Tab') return;
      const targets = [...panel.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]')];
      const first = targets[0];
      const last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    panel.addEventListener('keydown', trapFocus);
    return () => { panel.removeEventListener('keydown', trapFocus); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [id]);
  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;
    getOrderById(id).then((order) => {
      if (!cancelled) setRecord({ order });
      if (order.deliveryMethod === 'courier') {
        getDelivery(id).then((delivery) => { if (!cancelled) setRecord({ order, delivery }); })
          .catch(() => { if (!cancelled) setRecord({ order, courierError: 'Unable to load courier details.' }); });
      }
    }).catch((failure) => { if (!cancelled) setError(failure.message || 'Unable to load order details.'); });
    return () => { cancelled = true; };
  }, [id, refresh]);
  const order = record?.order;
  return <Modal open={Boolean(id)} onClose={onClose} className="admin-order-detail-modal" dialogLabel="Order details" title={order ? `Order ${adminOrderId(order.id)}` : 'Order details'}>
    <div className="admin-order-details">
      {error ? <div className="form-alert error" role="alert">{error}<button type="button" onClick={() => { setError(''); setRefresh((value) => value + 1); }}>Try again</button></div> : !order ? <p role="status">Loading order details...</p> : <>
        <section><h3>Order information</h3><DetailFields fields={[
          ['Order ID', order.id], ['Created', stamp(order.createdAt)], ['Order status', <Status key="status" order={order} />],
          ['Buyer', order.buyerName], ['Buyer location', order.deliveryMunicipality],
          ['Farmer', order.farmerName], ['Farm name', order.farmerFarmName], ['Farmer verification', order.farmerVerificationStatus],
        ]} /></section>
        <section><h3>Item and totals</h3>
          {order.productImageUrl ? <img className="admin-order-product-image" src={order.productImageUrl} alt={order.productName} /> : null}
          <DetailFields fields={[
            ['Product', order.productName], ['Quantity', `${order.quantity} ${order.unit}`],
            ['Saved unit price', formatCurrency(order.unitPrice)], ['Subtotal', formatCurrency(order.quantity * order.unitPrice)],
            ['Discount', 'Not recorded separately'], ['Delivery fee', formatCurrency(order.deliveryFee)], ['Final total', formatCurrency(order.totalAmount)],
          ]} />
        </section>
        <section><h3>Payment</h3><DetailFields fields={[
          ['Method', <PaymentMethodLabel key="method" method={order.paymentMethod} />], ['Payment status', paymentState(order)],
          ...(order.paymentMethod === 'gcash' ? [['Receipt verification', verificationState(order)], ['Reference', order.paymentReferenceNumber], ['Sender', order.paymentSenderName], ['Receipt submitted', stamp(order.paymentSubmittedAt)], ['Reviewed', stamp(order.paymentReviewedAt)], ['Payment rejection reason', order.paymentRejectionReason]] : []),
          ['Paid at', stamp(order.paidAt)], ['Transaction reference', order.transactionId],
        ]} />
          {order.paymentReceiptUrl ? <a className="admin-order-link" href={order.paymentReceiptUrl} target="_blank" rel="noreferrer">View payment receipt <ExternalLink size={14} /></a> : null}
        </section>
        <section><h3>Delivery</h3><DetailFields fields={[
          ['Delivery method', deliveryMethodLabel(order.deliveryMethod)], ['Delivery progress', progressLabel(order)],
          ['Source location', order.originMunicipality], ['Destination', order.deliveryMunicipality], ['Vehicle plate', order.vehiclePlateNumber],
        ]} />
          {record.courierError ? <p role="alert">{record.courierError}</p> : null}
          {record.delivery ? <>
            <DetailFields fields={[
              ['Courier', record.delivery.courierCompany], ['Courier status', courierDeliveryStatusLabel(record.delivery.deliveryStatus)], ['Booking reference', record.delivery.bookingReference],
              ['Booking created', stamp(record.delivery.createdAt)], ['Courier record updated', stamp(record.delivery.updatedAt)],
            ]} />
            {record.delivery.trackingUrl ? <a className="admin-order-link" href={record.delivery.trackingUrl} target="_blank" rel="noreferrer">Open tracking page <ExternalLink size={14} /></a> : null}
          </> : null}
        </section>
        {['cancelled', 'rejected'].includes(order.status) ? <section><h3>{orderLabel(order.status)}</h3><DetailFields fields={[
          ['Reason', (order.status === 'cancelled' ? order.cancellationReason : order.rejectionReason) || 'No reason recorded'],
        ]} /></section> : null}
        <section><h3>Recorded history</h3><ol className="admin-order-history">
          <li><strong>Order placed</strong><time>{stamp(order.createdAt)}</time></li>
          {(order.deliveryEvents || []).filter((event) => event.occurredAt).map((event) => <li key={event.id}><strong>{event.title || orderLabel(event.status)}</strong><time>{stamp(event.occurredAt)}</time>{event.description ? <p>{event.description}</p> : null}</li>)}
        </ol>{!order.deliveryEvents?.length ? <p className="admin-order-secondary">No additional status history recorded.</p> : null}</section>
      </>}
    </div>
  </Modal>;
}

export default function AdminOrders() {
  const { currentUser } = useAuth();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [copyError, setCopyError] = useState('');
  const copyTimer = useRef(null);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await getAdminOrderPage(filters);
        if (cancelled) return;
        const lastPage = Math.max(1, Math.ceil(data.total / 15));
        if (filters.page > lastPage) { setFilters((value) => ({ ...value, page: lastPage })); return; }
        setResult(data); setError('');
      } catch (failure) { if (!cancelled) setError(failure.message || 'Unable to load orders. Try again.'); }
      finally { if (!cancelled) setLoading(false); }
    };
    const timer = setTimeout(load, 250);
    const interval = setInterval(load, 10000);
    return () => { cancelled = true; clearTimeout(timer); clearInterval(interval); };
  }, [filters, refresh]);
  const changeFilter = (key, value) => { setLoading(true); setFilters((old) => ({ ...old, [key]: value, page: 1 })); };
  const overviewFilter = (key) => {
    setLoading(true);
    setFilters({ ...EMPTY_FILTERS, status: key === 'all' ? '' : ['preparing', 'out_for_delivery'].includes(key) ? 'confirmed' : key, deliveryStatus: ['preparing', 'out_for_delivery'].includes(key) ? key : '' });
  };
  const copyId = async (id) => {
    try { await navigator.clipboard.writeText(id); setCopiedId(id); setCopyError(''); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopiedId(null), 2000); }
    catch { setCopyError('Unable to copy the order ID. You can find the full ID in View details.'); }
  };
  const orderIdentity = (row) => <div><span className="admin-order-id">{adminOrderId(row.id)}</span><button className="admin-order-copy" type="button" aria-label={`Copy order ID ${adminOrderId(row.id)}`} title={copiedId === row.id ? 'Copied' : 'Copy full order ID'} onClick={() => copyId(row.id)}>{copiedId === row.id ? <Check size={13} /> : <Copy size={13} />}</button></div>;
  const action = (row) => <button className="admin-order-link" type="button" onClick={() => setSelectedId(row.id)} aria-label={`View details for order ${adminOrderId(row.id)}`}>View details <ArrowRight size={14} /></button>;
  const hasFilters = Object.entries(filters).some(([key, value]) => key !== 'page' && Boolean(value));
  const emptyMessage = hasFilters ? 'No orders match these filters' : 'No orders found';
  return <AppShell user={currentUser} navItems={adminNavItems} title="Orders" hideHeader>
    <div className="admin-orders-page">
      <PageHeader title="Orders" description="Every purchase order placed across the marketplace." />
      <nav className="admin-order-overview" aria-label="Order overview">
        {OVERVIEW.map(([key, label]) => {
          const stage = ['preparing', 'out_for_delivery'].includes(key);
          const active = stage ? filters.status === 'confirmed' && filters.deliveryStatus === key : key === 'all' ? !hasFilters : filters.status === key && !filters.deliveryStatus;
          return <button type="button" key={key} aria-pressed={active} onClick={() => overviewFilter(key)}><span>{label}</span><strong>{result?.counts?.[key] ?? '--'}</strong></button>;
        })}
      </nav>
      <div className="admin-order-toolbar">
        <label className="admin-order-search"><span>Search orders</span><div><Search size={16} /><input type="search" maxLength={120} value={filters.search} placeholder="Order ID, buyer, farmer or product" onChange={(event) => changeFilter('search', event.target.value)} /></div></label>
        {[
          ['status', 'Order status', ORDER_STATUSES.map((value) => [value, orderLabel(value)])],
          ['deliveryStatus', 'Delivery progress', DELIVERY_STAGES.map((value) => [value, value === 'pending' ? 'Not started / Order confirmed' : deliveryStepLabel(value)])],
          ['paymentMethod', 'Payment method', [['cod', 'Cash on Delivery'], ['gcash', 'GCash']]],
          ['paymentStatus', 'Payment status', [['pending', 'Payment pending'], ['paid', 'Paid'], ['failed', 'Failed'], ['refunded', 'Refunded']]],
          ['deliveryMethod', 'Delivery method', ['farmer_delivery', 'buyer_pickup', 'courier'].map((value) => [value, deliveryMethodLabel(value)])],
        ].map(([key, label, options]) => <label key={key}><span>{label}</span><select value={filters[key]} onChange={(event) => changeFilter(key, event.target.value)}><option value="">All</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>)}
        <label><span>Created from</span><input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => changeFilter('from', event.target.value)} /></label>
        <label><span>Created to</span><input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => changeFilter('to', event.target.value)} /></label>
        <button type="button" className="admin-order-refresh" aria-label="Refresh orders" title="Refresh orders" disabled={loading} onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}><RotateCw size={16} /></button>
      </div>
      {copyError ? <p role="alert">{copyError}</p> : null}
      {error ? <div className="form-alert error" role="alert">{error} <button type="button" onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}>Try again</button></div> : null}
      {loading ? <p role="status">Loading orders...</p> : null}
      {result && !loading && !error ? <>
        <div className="admin-order-desktop">
          <Table columns={[
            { key: 'id', label: 'Order', render: orderIdentity },
            { key: 'buyerName', label: 'Buyer', render: (row) => <div><strong>{row.buyerName}</strong><small>Farmer: {row.farmerName}</small></div> },
            { key: 'productName', label: 'Product', render: (row) => <div><strong>{row.productName}</strong><small>{row.quantity} {row.unit}</small></div> },
            { key: 'payment', label: 'Payment', render: (row) => <Payment order={row} /> },
            { key: 'deliveryStatus', label: 'Delivery progress', render: (row) => <div>{progressLabel(row)}<small>{deliveryMethodLabel(row.deliveryMethod)}</small></div> },
            { key: 'status', label: 'Order status', render: (row) => <Status order={row} /> },
            { key: 'createdAt', label: 'Created', render: (row) => formatDate(row.createdAt) },
            { key: 'action', label: 'Action', render: action },
          ]} rows={result.orders} emptyMessage={emptyMessage} />
        </div>
        <div className="admin-order-mobile">
          {!result.orders.length ? <p>{emptyMessage}</p> : result.orders.map((row) => <article key={row.id}>
            <header><strong>{row.productName} &middot; {row.quantity} {row.unit}</strong>{orderIdentity(row)}</header>
            <p>{row.buyerName}</p><small>Farmer: {row.farmerName}</small>
            <dl><div><dt>Delivery method</dt><dd>{deliveryMethodLabel(row.deliveryMethod)}</dd></div><div><dt>Delivery progress</dt><dd>{progressLabel(row)}</dd></div><div><dt>Order status</dt><dd><Status order={row} /></dd></div><div><dt>Payment</dt><dd><Payment order={row} /></dd></div></dl>
            <footer><time>{formatDate(row.createdAt)}</time>{action(row)}</footer>
          </article>)}
        </div>
        <Pagination page={filters.page} pageSize={15} total={result.total} onPageChange={(page) => { setLoading(true); setFilters((value) => ({ ...value, page })); }} />
      </> : null}
      {selectedId ? <OrderDetails key={selectedId} id={selectedId} onClose={() => setSelectedId(null)} /> : null}
    </div>
  </AppShell>;
}
