import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { receiptCurrency, receiptDate } from '../../backend/shared/receipt.js';

const money = (value) => receiptCurrency(value).replace(/^\u20b1\s*/, 'PHP ');

export function buildReceiptPdf({ receipt, logoImage }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2; // 178mm
  const rightEdge = pageWidth - margin;

  doc.setProperties({ title: `HarvestLink Receipt - ${receipt.orderNumber}`, author: 'HarvestLink' });
  doc.setFont('helvetica', 'normal');

  // Top Header: Brand (left) + Receipt Title & Order # (right)
  let y = 18;
  const hasLogo = Boolean(logoImage?.complete && logoImage.naturalWidth > 0);
  if (hasLogo) {
    doc.addImage(logoImage, 'PNG', margin, y - 5, 11, 11);
  }
  const brandX = hasLogo ? margin + 14 : margin;
  doc.setTextColor(22, 101, 52);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('HarvestLink', brandX, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 107);
  doc.setFontSize(9);
  doc.text('Cebu Farm-to-Market', brandX, y + 5);

  doc.setTextColor(31, 41, 35);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(receipt.final ? 'TRANSACTION RECEIPT' : 'ORDER SUMMARY', rightEdge, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(100, 116, 107);
  doc.text(`Order #${receipt.orderNumber}`, rightEdge, y + 5, { align: 'right' });

  y += 11;
  doc.setDrawColor(214, 224, 217);
  doc.setLineWidth(0.4);
  doc.line(margin, y, rightEdge, y);
  y += 7;

  // Compact 2-column Metadata & Parties card
  const orderInfoRows = [
    ['Order number', receipt.orderNumber],
    ['Status', receipt.final ? 'Transaction completed' : 'Pending completion'],
    ['Order date', receiptDate(receipt.createdAt)],
    receipt.completedAt ? ['Completed at', receiptDate(receipt.completedAt, true)] : null,
  ].filter(Boolean);

  const partyRows = [
    ['Buyer', receipt.buyer.name],
    receipt.buyer.email ? ['Buyer email', receipt.buyer.email] : null,
    receipt.seller.farmName ? ['Farm', receipt.seller.farmName] : null,
    ['Seller', receipt.seller.name],
  ].filter(Boolean);

  const colGap = 8;
  const halfWidth = (contentWidth - colGap) / 2;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: pageWidth - margin - halfWidth },
    tableWidth: halfWidth,
    head: [['Order Details', '']],
    body: orderInfoRows,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, textColor: [38, 51, 43], cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 2.5 }, overflow: 'linebreak' },
    headStyles: { fontStyle: 'bold', fontSize: 9, fillColor: [243, 247, 244], textColor: [22, 51, 30] },
    columnStyles: {
      0: { cellWidth: 28, textColor: [100, 116, 107] },
      1: { cellWidth: halfWidth - 28, halign: 'right', fontStyle: 'bold' },
    },
  });
  const leftMetaEndY = doc.lastAutoTable.finalY;

  autoTable(doc, {
    startY: y,
    margin: { left: margin + halfWidth + colGap, right: margin },
    tableWidth: halfWidth,
    head: [['Buyer & Seller', '']],
    body: partyRows,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, textColor: [38, 51, 43], cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 2.5 }, overflow: 'linebreak' },
    headStyles: { fontStyle: 'bold', fontSize: 9, fillColor: [243, 247, 244], textColor: [22, 51, 30] },
    columnStyles: {
      0: { cellWidth: 26, textColor: [100, 116, 107] },
      1: { cellWidth: halfWidth - 26, halign: 'right', fontStyle: 'bold' },
    },
  });
  const rightMetaEndY = doc.lastAutoTable.finalY;

  y = Math.max(leftMetaEndY, rightMetaEndY) + 7;

  // Items Table
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: contentWidth,
    head: [['Product', 'Quantity x Unit Price', 'Amount']],
    body: receipt.items.map((item) => [
      item.name,
      `${item.quantity} ${item.unit} x ${money(item.unitPrice)}`,
      money(item.total),
    ]),
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9.5,
      textColor: [38, 51, 43],
      cellPadding: { top: 2.8, bottom: 2.8, left: 2.5, right: 2.5 },
      lineColor: [230, 236, 232],
      lineWidth: { bottom: 0.2 },
      overflow: 'linebreak',
    },
    headStyles: {
      fontStyle: 'bold',
      fontSize: 9,
      fillColor: [243, 247, 244],
      textColor: [22, 51, 30],
    },
    columnStyles: {
      0: { cellWidth: 78, fontStyle: 'bold' },
      1: { cellWidth: 60, textColor: [84, 98, 90] },
      2: { cellWidth: 40, halign: 'right', fontStyle: 'bold' },
    },
  });
  y = doc.lastAutoTable.finalY + 4;

  // Right-aligned Totals Summary
  const totalsWidth = 82;
  autoTable(doc, {
    startY: y,
    margin: { left: rightEdge - totalsWidth, right: margin },
    tableWidth: totalsWidth,
    body: [
      ['Subtotal', money(receipt.subtotal)],
      ['Delivery fee', money(receipt.deliveryFee)],
      ['Total Amount', money(receipt.total)],
    ],
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9.5,
      textColor: [38, 51, 43],
      cellPadding: { top: 2, bottom: 2, left: 2.5, right: 2.5 },
    },
    columnStyles: {
      0: { cellWidth: 38, textColor: [100, 116, 107] },
      1: { cellWidth: 44, halign: 'right' },
    },
    didParseCell(data) {
      if (data.row.index === 2) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 10.5;
        data.cell.styles.textColor = [22, 51, 30];
        data.cell.styles.fillColor = [243, 247, 244];
      }
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  // Side-by-side Payment & Delivery Details
  const paymentRows = [
    ['Method', receipt.payment.method],
    ['Status', receipt.payment.status],
    receipt.payment.verified ? ['Verification', 'Verified'] : null,
    receipt.payment.reference ? ['Reference #', receipt.payment.reference] : null,
  ].filter(Boolean);

  const deliveryRows = [
    ['Method', receipt.delivery.method],
    ['Status', receipt.delivery.status],
    receipt.completedAt ? ['Completed', receiptDate(receipt.completedAt, true)] : null,
    receipt.delivery.bookingReference ? ['Booking ref', receipt.delivery.bookingReference] : null,
  ].filter(Boolean);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: pageWidth - margin - halfWidth },
    tableWidth: halfWidth,
    head: [['Payment Information', '']],
    body: paymentRows,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, textColor: [38, 51, 43], cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 2.5 }, overflow: 'linebreak' },
    headStyles: { fontStyle: 'bold', fontSize: 9, fillColor: [243, 247, 244], textColor: [22, 51, 30] },
    columnStyles: {
      0: { cellWidth: 28, textColor: [100, 116, 107] },
      1: { cellWidth: halfWidth - 28, halign: 'right' },
    },
  });
  const paymentEndY = doc.lastAutoTable.finalY;

  autoTable(doc, {
    startY: y,
    margin: { left: margin + halfWidth + colGap, right: margin },
    tableWidth: halfWidth,
    head: [['Delivery Information', '']],
    body: deliveryRows,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, textColor: [38, 51, 43], cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 2.5 }, overflow: 'linebreak' },
    headStyles: { fontStyle: 'bold', fontSize: 9, fillColor: [243, 247, 244], textColor: [22, 51, 30] },
    columnStyles: {
      0: { cellWidth: 28, textColor: [100, 116, 107] },
      1: { cellWidth: halfWidth - 28, halign: 'right' },
    },
  });
  const deliveryEndY = doc.lastAutoTable.finalY;

  y = Math.max(paymentEndY, deliveryEndY) + 10;

  // Footer stays cleanly on Page 1
  if (y > 275) {
    doc.addPage();
    y = 20;
  }
  doc.setDrawColor(214, 224, 217);
  doc.setLineWidth(0.3);
  doc.line(margin, y, rightEdge, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 107);
  doc.text(
    receipt.final
      ? 'This receipt is an official record of your completed HarvestLink transaction.'
      : 'This summary reflects the current saved order on HarvestLink.',
    margin,
    y + 6,
  );
  doc.text('Thank you for supporting local farmers on HarvestLink.', margin, y + 11);

  return doc;
}

export function receiptPdfFileName(orderNumber) {
  return `HarvestLink-Receipt-${String(orderNumber).replace(/[^a-zA-Z0-9-]/g, '')}.pdf`;
}
