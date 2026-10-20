import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import Button from '../../components/common/Button';
import logo from '../../assets/logo.png';
import { useAuth } from '../auth/AuthContext';
import { getOrderReceipt } from '../../services/orderService';
import { getNavItemsForRole } from '../../utils/navItemsByRole';
import { receiptCurrency, receiptDate } from '../../../backend/shared/receipt.js';
import './OrderReceipt.css';

export default function OrderReceipt() {
  const { id } = useParams();
  const { currentUser } = useAuth();
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [printMessage, setPrintMessage] = useState('');
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getOrderReceipt(id).then(receipt => {
      if (!cancelled) setResult({ id, receipt });
    }).catch(error => {
      if (!cancelled) setResult({ id, error: error.status === 403 || error.status === 404
        ? 'This receipt is not available to your account.' : 'Unable to load this receipt. Please try again.' });
    });
    return () => { cancelled = true; };
  }, [id, attempt]);

  const receipt = result?.id === id ? result.receipt : null;
  const error = result?.id === id ? result.error : null;
  const orderPath = `/orders/${encodeURIComponent(id)}`;
  const handlePrintReceipt = async () => {
    if (printing) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) printWindow.opener = null;
    setPrinting(true);
    setPrintMessage('');
    try {
      const { buildReceiptPdf, receiptPdfFileName } = await import('../../utils/receiptPdf.js');
      const pdf = buildReceiptPdf({ receipt, logoImage: document.querySelector('.transaction-receipt-brand img') });
      if (!printWindow) {
        pdf.save(receiptPdfFileName(receipt.orderNumber));
        setPrintMessage('The receipt PDF was downloaded.');
      } else {
        pdf.autoPrint();
        const url = URL.createObjectURL(pdf.output('blob'));
        printWindow.location.replace(url);
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
        setPrintMessage('The receipt PDF opened for printing.');
      }
    } catch {
      printWindow?.close();
      setPrintMessage('Could not generate the receipt PDF. Please try again.');
    } finally { setPrinting(false); }
  };

  return <AppShell user={currentUser} navItems={getNavItemsForRole(currentUser.role)} title="Receipt" subtitle={receipt ? `Order ${receipt.orderNumber}` : ''} pageClassName="receipt-page">
    {!receipt ? <section className="transaction-receipt" aria-live="polite">
      <h2>{error ? 'Receipt unavailable' : 'Loading receipt'}</h2>
      {error ? <><p role="alert">{error}</p><Button variant="secondary" onClick={() => { setResult(null); setAttempt(value => value + 1); }}>Try again</Button></> : null}
      <Link to={orderPath}>Back to order</Link>
    </section> : <article className="transaction-receipt" aria-labelledby="transaction-receipt-title">
      <header className="transaction-receipt-header">
        <div className="transaction-receipt-brand"><img src={logo} alt="" /><div><strong>HarvestLink</strong><p>Cebu Farm-to-Market</p></div></div>
        <h2 id="transaction-receipt-title">{receipt.final ? 'Transaction completed' : 'Order summary'}</h2>
        <p>{receipt.final ? 'Thank you for using HarvestLink.' : 'This transaction is not yet finalized.'}</p>
      </header>
      <section className="transaction-receipt-section">
        <h3>Order details</h3><dl className="transaction-receipt-details">
          <div><dt>Order number</dt><dd>{receipt.orderNumber}</dd></div>
          <div><dt>Order date</dt><dd>{receiptDate(receipt.createdAt)}</dd></div>
          {receipt.completedAt ? <div><dt>Completed</dt><dd>{receiptDate(receipt.completedAt, true)}</dd></div> : null}
        </dl>
        <div className="transaction-receipt-parties">
          <div><h3>Buyer</h3><p className="transaction-receipt-name">{receipt.buyer.name}</p>{receipt.buyer.email ? <p>{receipt.buyer.email}</p> : null}</div>
          <div><h3>Seller</h3>{receipt.seller.farmName ? <p className="transaction-receipt-name">{receipt.seller.farmName}</p> : null}<p>{receipt.seller.name}</p></div>
        </div>
      </section>
      <section className="transaction-receipt-section">
        <h3>Items</h3><table className="transaction-receipt-items">
          <thead><tr><th scope="col">Product</th><th scope="col">Quantity &times; price</th><th scope="col">Total</th></tr></thead>
          <tbody>{receipt.items.map((item, index) => <tr key={index}><td>{item.name}</td><td>{item.quantity} {item.unit} &times; {receiptCurrency(item.unitPrice)}</td><td>{receiptCurrency(item.total)}</td></tr>)}</tbody>
        </table>
        <dl className="transaction-receipt-details transaction-receipt-totals">
          <div><dt>Subtotal</dt><dd>{receiptCurrency(receipt.subtotal)}</dd></div>
          <div><dt>Delivery fee</dt><dd>{receiptCurrency(receipt.deliveryFee)}</dd></div>
          <div className="transaction-receipt-total"><dt>Total</dt><dd>{receiptCurrency(receipt.total)}</dd></div>
        </dl>
      </section>
      <section className="transaction-receipt-section"><h3>Payment</h3><dl className="transaction-receipt-details">
        <div><dt>Payment method</dt><dd>{receipt.payment.method}</dd></div>
        <div><dt>Payment status</dt><dd>{receipt.payment.status}</dd></div>
        {receipt.payment.verified ? <div><dt>Payment verification</dt><dd>Verified</dd></div> : null}
        {receipt.payment.reference ? <div><dt>Payment reference</dt><dd>{receipt.payment.reference}</dd></div> : null}
      </dl></section>
      <section className="transaction-receipt-section"><h3>Delivery</h3><dl className="transaction-receipt-details">
        <div><dt>Delivery method</dt><dd>{receipt.delivery.method}</dd></div>
        <div><dt>Delivery status</dt><dd>{receipt.delivery.status}</dd></div>
        {receipt.completedAt ? <div><dt>Completed at</dt><dd>{receiptDate(receipt.completedAt, true)}</dd></div> : null}
        {receipt.delivery.bookingReference ? <div><dt>Booking reference</dt><dd>{receipt.delivery.bookingReference}</dd></div> : null}
      </dl></section>
      <footer className="transaction-receipt-footer">
        <p>{receipt.final ? 'This receipt is a record of your completed HarvestLink transaction.' : 'This summary reflects the current saved order.'}</p>
        <div className="transaction-receipt-actions"><Link className="btn btn-secondary btn-md" to={orderPath}><ArrowLeft size={15} aria-hidden="true" />View order</Link><Button variant="secondary" onClick={handlePrintReceipt} disabled={printing}><Printer size={15} aria-hidden="true" />{printing ? 'Preparing PDF' : 'Print receipt'}</Button></div>
        {printMessage ? <p role="status">{printMessage}</p> : null}
      </footer>
    </article>}
  </AppShell>;
}
