import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const PAGE = {
  width: 210,
  height: 297,
  margin: 18,
};

const COLORS = {
  green: [22, 101, 52],
  text: [22, 37, 29],
  muted: [70, 83, 75],
  line: [203, 213, 207],
};

function addRule(doc, y) {
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.25);
  doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
}

function addLabelValue(doc, label, value, y) {
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.muted);
  doc.text(label, PAGE.margin, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.text);
  doc.text(String(value), PAGE.width - PAGE.margin, y, { align: 'right' });
}

function formatPdfCurrency(formattedAmount) {
  return formattedAmount.replace(/^₱\s*/, 'PHP ');
}

export function buildReceiptPdf({
  order,
  orderNumber,
  orderDate,
  formattedUnitPrice,
  formattedSubtotal,
  formattedDeliveryFee,
  formattedTotal,
  paymentMethod,
  paymentStatus,
  deliveryMethod,
  logoImage,
}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const contentRight = PAGE.width - PAGE.margin;
  const contentWidth = contentRight - PAGE.margin;
  const unitPrice = formatPdfCurrency(formattedUnitPrice);
  const subtotalAmount = formatPdfCurrency(formattedSubtotal);
  const deliveryFeeAmount = formatPdfCurrency(formattedDeliveryFee);
  const totalAmount = formatPdfCurrency(formattedTotal);

  doc.setProperties({
    title: `HarvestLink Receipt - ${orderNumber}`,
    subject: 'HarvestLink order receipt',
    author: 'HarvestLink',
  });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.text);

  if (logoImage?.complete && logoImage.naturalWidth > 0) {
    doc.addImage(logoImage, 'PNG', PAGE.margin, 16, 14, 14);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...COLORS.green);
  doc.text('HarvestLink', PAGE.margin + 18, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text('Cebu Farm-to-Market', PAGE.margin + 18, 27);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(21);
  doc.setTextColor(...COLORS.text);
  doc.text('RECEIPT', contentRight, 21, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Order #${orderNumber}`, contentRight, 27, { align: 'right' });
  doc.text(orderDate, contentRight, 32, { align: 'right' });
  addRule(doc, 39);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.muted);
  doc.text('Buyer', PAGE.margin, 48);
  doc.text('Farmer', PAGE.margin, 56);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.text);
  const partyValueX = contentRight;
  doc.text(doc.splitTextToSize(String(order.buyerName || ''), contentWidth * 0.66), partyValueX, 48, { align: 'right' });
  doc.text(doc.splitTextToSize(String(order.farmerName || ''), contentWidth * 0.66), partyValueX, 56, { align: 'right' });
  addRule(doc, 62);

  autoTable(doc, {
    startY: 67,
    margin: { left: PAGE.margin, right: PAGE.margin, bottom: 20 },
    head: [['ITEM', 'QTY', 'UNIT PRICE', 'SUBTOTAL']],
    body: [[
      String(order.productName || ''),
      `${order.quantity} ${order.unit}`,
      unitPrice,
      subtotalAmount,
    ]],
    styles: {
      font: 'helvetica',
      fontSize: 9,
      textColor: COLORS.text,
      lineColor: COLORS.line,
      lineWidth: 0.2,
      cellPadding: { top: 3, right: 2, bottom: 3, left: 2 },
      overflow: 'linebreak',
    },
    headStyles: {
      fontStyle: 'bold',
      textColor: COLORS.text,
      fillColor: [255, 255, 255],
      lineWidth: 0.25,
    },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.4 },
      1: { cellWidth: contentWidth * 0.15 },
      2: { cellWidth: contentWidth * 0.22, halign: 'right' },
      3: { cellWidth: contentWidth * 0.23, halign: 'right' },
    },
  });

  let y = (doc.lastAutoTable?.finalY ?? 67) + 8;
  if (y + 66 > PAGE.height - 18) {
    doc.addPage();
    y = 20;
  }

  const totalsLeft = contentRight - 72;
  const totalsRows = [
    ['Subtotal', subtotalAmount],
    [`Delivery fee${order.deliveryFeeTier ? ` (${order.deliveryFeeTier})` : ''}`, deliveryFeeAmount],
  ];
  doc.setFontSize(9);
  totalsRows.forEach(([label, value], index) => {
    const rowY = y + (index * 7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.muted);
    doc.text(label, totalsLeft, rowY);
    doc.text(value, contentRight, rowY, { align: 'right' });
  });
  y += 18;
  doc.setDrawColor(...COLORS.line);
  doc.line(totalsLeft, y - 3, contentRight, y - 3);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.text);
  doc.text('TOTAL', totalsLeft, y + 3);
  doc.setFontSize(16);
  doc.setTextColor(...COLORS.green);
  doc.text(totalAmount, contentRight, y + 3, { align: 'right' });
  y += 18;

  if (y + 45 > PAGE.height - 18) {
    doc.addPage();
    y = 20;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.text);
  doc.text('PAYMENT & DELIVERY', PAGE.margin, y);
  y += 8;
  addLabelValue(doc, 'Payment method', paymentMethod, y);
  y += 7;
  addLabelValue(doc, 'Payment status', paymentStatus, y);
  y += 7;
  addLabelValue(doc, 'Delivery method', deliveryMethod, y);
  y += 7;
  if (order.deliveryDistanceKm) {
    addLabelValue(doc, 'Delivery distance', `${order.deliveryDistanceKm.toFixed(1)} km`, y);
    y += 7;
  }
  if (order.transactionId) {
    addLabelValue(doc, 'GCash transaction ID', order.transactionId, y);
    y += 7;
  }

  y += 4;
  addRule(doc, y);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text('Thank you for supporting local Cebu farmers.', PAGE.width / 2, y + 8, { align: 'center' });

  return doc;
}

export function receiptPdfFileName(orderNumber) {
  return `HarvestLink-Receipt-${String(orderNumber).replace(/[^a-zA-Z0-9-]/g, '')}.pdf`;
}
