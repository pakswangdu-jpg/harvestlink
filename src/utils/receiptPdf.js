import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { receiptCurrency, receiptDate } from '../../backend/shared/receipt.js';

const money = value => receiptCurrency(value).replace(/^\u20b1\s*/, 'PHP ');

export function buildReceiptPdf({ receipt, logoImage }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const left = 18;
  const right = 192;
  let y = 20;
  doc.setProperties({ title: `HarvestLink Receipt - ${receipt.orderNumber}`, author: 'HarvestLink' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(38, 51, 43);
  if (logoImage?.complete && logoImage.naturalWidth > 0) doc.addImage(logoImage, 'PNG', left, y - 4, 10, 10);
  doc.setFontSize(16);
  doc.text('HarvestLink', left + 14, y);
  doc.setFontSize(9);
  doc.text('Cebu Farm-to-Market', left + 14, y + 6);
  y += 21;
  doc.setFontSize(18);
  doc.text(receipt.final ? 'Transaction completed' : 'Order summary', left, y);
  y += 10;

  const section = (title, rows) => {
    autoTable(doc, {
      startY: y, margin: { left, right: left, bottom: 18 },
      head: [[title, '']], body: rows.filter(row => row[1] != null && row[1] !== '').map(([label, value]) => [label, String(value)]),
      theme: 'plain', styles: { font: 'helvetica', fontSize: 10, textColor: [38, 51, 43], cellPadding: 2.5, overflow: 'linebreak' },
      headStyles: { fontStyle: 'bold', fontSize: 9, fillColor: [248, 249, 248] },
      columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 119, halign: 'right' } },
    });
    y = doc.lastAutoTable.finalY + 7;
  };
  section('Order details', [
    ['Order number', receipt.orderNumber], ['Order date', receiptDate(receipt.createdAt)],
    ['Completed', receipt.completedAt ? receiptDate(receipt.completedAt, true) : null],
    ['Buyer', receipt.buyer.name], ['Buyer email', receipt.buyer.email],
    ['Farm', receipt.seller.farmName], ['Seller', receipt.seller.name],
  ]);
  autoTable(doc, {
    startY: y, margin: { left, right: left, bottom: 18 },
    head: [['Product', 'Quantity x price', 'Total']],
    body: receipt.items.map(item => [item.name, `${item.quantity} ${item.unit} x ${money(item.unitPrice)}`, money(item.total)]),
    theme: 'plain', styles: { font: 'helvetica', fontSize: 10, cellPadding: 3, textColor: [38, 51, 43], overflow: 'linebreak' },
    headStyles: { fontStyle: 'bold', fontSize: 9, fillColor: [248, 249, 248] },
    columnStyles: { 0: { cellWidth: 72 }, 1: { cellWidth: 62 }, 2: { cellWidth: 40, halign: 'right' } },
  });
  y = doc.lastAutoTable.finalY + 7;
  section('Totals', [['Subtotal', money(receipt.subtotal)], ['Delivery fee', money(receipt.deliveryFee)], ['Total', money(receipt.total)]]);
  section('Payment', [
    ['Payment method', receipt.payment.method], ['Payment status', receipt.payment.status],
    ['Payment verification', receipt.payment.verified ? 'Verified' : null], ['Payment reference', receipt.payment.reference],
  ]);
  section('Delivery', [
    ['Delivery method', receipt.delivery.method], ['Delivery status', receipt.delivery.status],
    ['Completed at', receipt.completedAt ? receiptDate(receipt.completedAt, true) : null], ['Booking reference', receipt.delivery.bookingReference],
  ]);
  if (y > 265) { doc.addPage(); y = 20; }
  doc.setDrawColor(221, 228, 223);
  doc.line(left, y, right, y);
  doc.setFontSize(9);
  doc.text(receipt.final ? 'This receipt is a record of your completed HarvestLink transaction.' : 'This summary reflects the current saved order.', left, y + 7);
  doc.text('Thank you for using HarvestLink.', left, y + 13);
  return doc;
}

export function receiptPdfFileName(orderNumber) {
  return `HarvestLink-Receipt-${String(orderNumber).replace(/[^a-zA-Z0-9-]/g, '')}.pdf`;
}
