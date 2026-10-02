import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import BrandWordmark from '../../components/common/BrandWordmark';
import Button from '../../components/common/Button';
import PaymentMethodLabel from '../../components/common/PaymentMethodLabel';
import logo from '../../assets/logo.png';
import { useAuth } from '../auth/AuthContext';
import { getOrderById } from '../../services/orderService';
import {
  deliveryMethodLabel,
  formatCurrency,
  formatDate,
  paymentLabel,
  paymentStatusLabel,
  shortOrderId,
} from '../../utils/formatters';
import { getNavItemsForRole } from '../../utils/navItemsByRole';

function fallbackOrdersPath(role) {
  if (role === 'farmer') return '/farmer-orders';
  if (role === 'stakeholder') return '/stakeholder-orders';
  return '/buyer-orders';
}

export default function OrderReceipt() {
  const { id } = useParams();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loadedId, setLoadedId] = useState(null);
  const [printMessage, setPrintMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    getOrderById(id)
      .then((result) => {
        if (cancelled) return;
        setOrder(result);
        setLoadedId(id);
      })
      .catch(() => {
        if (cancelled) return;
        setOrder(null);
        setLoadedId(id);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);





  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'HarvestLink';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  if (loadedId !== id) return null;
  if (!order) return <Navigate to={fallbackOrdersPath(currentUser.role)} replace />;




  const isBuyer = currentUser.id === order.buyerId;
  const isFarmer = currentUser.role === 'farmer' && currentUser.id === order.farmerId;
  if (!isBuyer && !isFarmer) return <Navigate to={fallbackOrdersPath(currentUser.role)} replace />;

  const navItems = getNavItemsForRole(currentUser.role);
  const subtotal = order.unitPrice * order.quantity;

  const handlePrintReceipt = async () => {
    const printWindow = window.open('', '_blank');
    setPrintMessage('');

    try {
      const { buildReceiptPdf, receiptPdfFileName } = await import('../../utils/receiptPdf.js');
      const orderNumber = shortOrderId(order.id);
      const receiptPdf = buildReceiptPdf({
        order,
        orderNumber,
        orderDate: formatDate(order.createdAt),
        formattedUnitPrice: formatCurrency(order.unitPrice),
        formattedSubtotal: formatCurrency(subtotal),
        formattedDeliveryFee: formatCurrency(order.deliveryFee),
        formattedTotal: formatCurrency(order.totalAmount),
        paymentMethod: paymentLabel(order.paymentMethod),
        paymentStatus: paymentStatusLabel(order.paymentStatus),
        deliveryMethod: deliveryMethodLabel(order.deliveryMethod),
        logoImage: document.querySelector('.receipt-brand img'),
      });

      if (!printWindow) {
        receiptPdf.save(receiptPdfFileName(orderNumber));
        setPrintMessage('The receipt PDF was downloaded. Open it to print.');
        return;
      }

      receiptPdf.autoPrint();
      printWindow.location.replace(URL.createObjectURL(receiptPdf.output('blob')));
      setPrintMessage('The receipt PDF opened for printing.');
    } catch (error) {
      printWindow?.close();
      console.error('Unable to generate the order receipt PDF.', error);
      setPrintMessage('Could not generate the receipt PDF. Please try again.');
    }
  };

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title="Receipt"
      subtitle={`Order #${shortOrderId(order.id)}`}
      pageClassName="receipt-page"
    >
      <section className="panel receipt-panel">
        <div className="receipt-header">
          <div className="receipt-brand">
            <img src={logo} alt="" />
            <div>
              <strong><BrandWordmark /></strong>
              <p className="muted">Cebu Farm-to-Market</p>
            </div>
          </div>
          <div className="receipt-heading-meta">
            <h2>Receipt</h2>
            <div className="receipt-meta">
              <p><span>Order #</span><strong>{shortOrderId(order.id)}</strong></p>
              <p><span>Date</span><strong>{formatDate(order.createdAt)}</strong></p>
            </div>
          </div>
        </div>

        <div className="receipt-parties receipt-parties-buyer">
          <div><span>Buyer</span><strong>{order.buyerName}</strong></div>
          <div><span>Farmer</span><strong>{order.farmerName}</strong></div>
        </div>

        <table className="receipt-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{order.productName}</td>
              <td>{order.quantity} {order.unit}</td>
              <td>{formatCurrency(order.unitPrice)}</td>
              <td>{formatCurrency(subtotal)}</td>
            </tr>
          </tbody>
        </table>

        <div className="receipt-totals">
          <div><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
          <div>
            <span>
              Delivery fee{order.deliveryFeeTier ? ` (${order.deliveryFeeTier})` : ''}
            </span>
            <span>{formatCurrency(order.deliveryFee)}</span>
          </div>
          <div className="receipt-total-line"><span>Total</span><strong>{formatCurrency(order.totalAmount)}</strong></div>
        </div>

        <section className="receipt-payment-section" aria-label="Payment and delivery details">
          <h3>Payment &amp; Delivery</h3>
          <div className="receipt-parties receipt-parties-payment">
            <div><span>Payment method</span><strong><PaymentMethodLabel method={order.paymentMethod} /></strong></div>
            <div><span>Payment status</span><strong>{paymentStatusLabel(order.paymentStatus)}</strong></div>
            <div><span>Delivery method</span><strong>{deliveryMethodLabel(order.deliveryMethod)}</strong></div>
            {order.deliveryDistanceKm ? (
              <div><span>Delivery distance</span><strong>{order.deliveryDistanceKm.toFixed(1)} km</strong></div>
            ) : null}
            {order.transactionId ? (
              <div><span>GCash transaction ID</span><strong>{order.transactionId}</strong></div>
            ) : null}
          </div>
        </section>

        <p className="receipt-footer muted">Thank you for supporting local Cebu farmers.</p>

        <div className="form-actions receipt-actions">
          <Button variant="secondary" onClick={() => navigate(`/orders/${order.id}`)}>Back to order</Button>
          <Button onClick={handlePrintReceipt}><Printer size={15} /> Print receipt</Button>
        </div>
        <p className="receipt-print-hint" role="status" aria-live="polite">
          {printMessage || 'A clean receipt PDF will open for printing.'}
        </p>
      </section>
    </AppShell>
  );
}
