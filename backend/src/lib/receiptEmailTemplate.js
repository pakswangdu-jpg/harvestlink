import { receiptCurrency, receiptDate } from '../../shared/receipt.js';

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function renderReceiptEmail(receipt, appUrl) {
  if (!receipt.final) throw new Error('Only completed, paid transactions can be emailed as final receipts.');
  const orderUrl = new URL(`/orders/${encodeURIComponent(receipt.orderId)}`, appUrl).href;
  const receiptUrl = `${orderUrl}/receipt`;
  const firstName = String(receipt.buyer.name || '').trim().split(/\s+/)[0];
  const row = (label, value) => `<tr><td style="padding:5px 12px 5px 0;color:#637068;vertical-align:top;">${escape(label)}</td><td style="padding:5px 0;text-align:right;overflow-wrap:anywhere;">${escape(value)}</td></tr>`;
  const section = (title, rows) => `<h2 style="margin:22px 0 8px;font-size:12px;font-weight:600;">${title}</h2><table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;">${rows}</table>`;
  const orderRows = row('Order number', receipt.orderNumber) + row('Order date', receiptDate(receipt.createdAt))
    + (receipt.completedAt ? row('Completed', receiptDate(receipt.completedAt, true)) : '');
  const paymentRows = row('Payment method', receipt.payment.method) + row('Payment status', receipt.payment.status)
    + (receipt.payment.verified ? row('Payment verification', 'Verified') : '')
    + (receipt.payment.reference ? row('Payment reference', receipt.payment.reference) : '');
  const deliveryRows = row('Delivery method', receipt.delivery.method) + row('Delivery status', receipt.delivery.status)
    + (receipt.completedAt ? row('Completed at', receiptDate(receipt.completedAt, true)) : '')
    + (receipt.delivery.bookingReference ? row('Booking reference', receipt.delivery.bookingReference) : '');
  const itemRows = receipt.items.map(item => `<tr class="receipt-item">
    <td style="padding:14px 12px 14px 0;vertical-align:top;overflow-wrap:anywhere;">${escape(item.name)}</td>
    <td style="padding:14px 12px 14px 0;vertical-align:top;color:#637068;">${escape(item.quantity)} ${escape(item.unit)} &times; ${escape(receiptCurrency(item.unitPrice))}</td>
    <td style="padding:14px 0;vertical-align:top;text-align:right;font-weight:500;">${escape(receiptCurrency(item.total))}</td></tr>`).join('');
  const action = (url, label) => `<a class="receipt-action" href="${escape(url)}" style="display:inline-block;box-sizing:border-box;min-height:44px;padding:12px 18px;border:1px solid #bdcec3;border-radius:4px;color:#17653c;font-size:14px;font-weight:500;text-align:center;text-decoration:none;">${label}</a>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>@media(max-width:600px){.receipt-body{padding:20px!important}.receipt-item,.receipt-item td{display:block!important;width:auto!important;text-align:left!important}.receipt-item td{padding:3px 0!important}.receipt-item{padding:12px 0;border-bottom:1px solid #e1e6e3}.receipt-items thead{display:none!important}.receipt-action{display:block!important;width:100%!important;margin:8px 0!important}.receipt-parties td{display:block!important;width:auto!important;padding:8px 0!important}}</style></head>
    <body style="margin:0;background:#f6f7f6;color:#26332b;font-family:${FONT};font-size:14px;line-height:1.55;letter-spacing:0;">
    <table role="presentation" style="width:100%;max-width:640px;margin:24px auto;border:1px solid #dde4df;background:#fff;font-family:${FONT};"><tr><td class="receipt-body" style="padding:32px;">
    <div style="font-size:21px;font-weight:600;color:#17653c;">HarvestLink</div><div style="font-size:12px;color:#637068;">Cebu Farm-to-Market</div>
    <h1 style="margin:24px 0 10px;font-size:24px;font-weight:600;line-height:1.3;">Transaction completed</h1>
    <p style="margin:0 0 6px;">${firstName ? `Hi ${escape(firstName)},` : 'Hello,'}</p><p style="margin:0 0 20px;">Your HarvestLink transaction has been completed. Here's a summary of your order for your records.</p>
    <div style="border-top:1px solid #e1e6e3;">${section('Order details', orderRows)}</div>
    <table class="receipt-parties" role="presentation" style="width:100%;margin:18px 0;border-collapse:collapse;font-size:14px;"><tr>
      <td style="width:50%;padding:0 16px 0 0;vertical-align:top;overflow-wrap:anywhere;"><div style="font-size:12px;color:#637068;">Buyer</div><div style="font-weight:500;">${escape(receipt.buyer.name)}</div>${receipt.buyer.email ? `<div>${escape(receipt.buyer.email)}</div>` : ''}</td>
      <td style="width:50%;padding:0;vertical-align:top;overflow-wrap:anywhere;"><div style="font-size:12px;color:#637068;">Seller</div>${receipt.seller.farmName ? `<div style="font-weight:500;">${escape(receipt.seller.farmName)}</div>` : ''}<div>${escape(receipt.seller.name)}</div></td>
    </tr></table>
    <h2 style="margin:22px 0 8px;font-size:12px;font-weight:600;">Items</h2>
    <table class="receipt-items" style="width:100%;border-collapse:collapse;font-size:14px;border-top:1px solid #e1e6e3;border-bottom:1px solid #e1e6e3;"><thead><tr style="color:#637068;font-size:12px;"><th style="padding:10px 0;text-align:left;font-weight:500;">Product</th><th style="padding:10px 0;text-align:left;font-weight:500;">Quantity &times; price</th><th style="padding:10px 0;text-align:right;font-weight:500;">Total</th></tr></thead><tbody>${itemRows}</tbody></table>
    <table role="presentation" style="width:100%;margin:14px 0;font-size:14px;">${row('Subtotal', receiptCurrency(receipt.subtotal))}${row('Delivery fee', receiptCurrency(receipt.deliveryFee))}
      <tr><td style="padding:12px 0;border-top:1px solid #e1e6e3;font-size:17px;font-weight:600;">Total</td><td style="padding:12px 0;border-top:1px solid #e1e6e3;text-align:right;font-size:18px;font-weight:600;">${escape(receiptCurrency(receipt.total))}</td></tr></table>
    <div style="border-top:1px solid #e1e6e3;">${section('Payment', paymentRows)}</div>
    <div style="margin-top:18px;border-top:1px solid #e1e6e3;">${section('Delivery', deliveryRows)}</div>
    <p style="margin:24px 0;font-size:12px;color:#637068;">This receipt is a record of your completed HarvestLink transaction.</p>
    <div>${action(orderUrl, 'View order')} ${action(receiptUrl, 'View receipt')}</div>
    <p style="margin:24px 0 0;font-size:13px;color:#637068;">Thank you for using HarvestLink.<br>HarvestLink<br>Cebu Farm-to-Market</p>
    </td></tr></table></body></html>`;
  const text = [
    'HarvestLink', 'Cebu Farm-to-Market', '', 'Transaction completed', '', firstName ? `Hi ${firstName},` : 'Hello,',
    "Your HarvestLink transaction has been completed. Here's a summary of your order for your records.", '',
    `Order number: ${receipt.orderNumber}`, `Order date: ${receiptDate(receipt.createdAt)}`,
    ...(receipt.completedAt ? [`Completed: ${receiptDate(receipt.completedAt, true)}`] : []), '',
    `Buyer: ${receipt.buyer.name}`, ...(receipt.buyer.email ? [receipt.buyer.email] : []),
    `Seller: ${[receipt.seller.farmName, receipt.seller.name].filter(Boolean).join(' - ')}`, '', 'Items',
    ...receipt.items.map(item => `${item.name}\n${item.quantity} ${item.unit} \u00d7 ${receiptCurrency(item.unitPrice)}: ${receiptCurrency(item.total)}`), '',
    `Subtotal: ${receiptCurrency(receipt.subtotal)}`, `Delivery fee: ${receiptCurrency(receipt.deliveryFee)}`, `Total: ${receiptCurrency(receipt.total)}`, '',
    `Payment method: ${receipt.payment.method}`, `Payment status: ${receipt.payment.status}`,
    ...(receipt.payment.verified ? ['Payment verification: Verified'] : []),
    ...(receipt.payment.reference ? [`Payment reference: ${receipt.payment.reference}`] : []), '',
    `Delivery method: ${receipt.delivery.method}`, `Delivery status: ${receipt.delivery.status}`,
    ...(receipt.delivery.bookingReference ? [`Booking reference: ${receipt.delivery.bookingReference}`] : []), '',
    'This receipt is a record of your completed HarvestLink transaction.', `View order: ${orderUrl}`, `View receipt: ${receiptUrl}`, '',
    'Thank you for using HarvestLink.', 'HarvestLink', 'Cebu Farm-to-Market',
  ].join('\n');
  return { subject: `HarvestLink receipt - Order ${receipt.orderNumber}`, html, text };
}
