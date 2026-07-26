import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from '../../../utils/formatters';
import { STATUS_META } from './statusMeta';

const COLUMNS = ['Commodity', 'Category', 'PSA Reference Price', 'Average Farmer Price', 'Listings', 'Status', 'Override Price'];

function toRowValues(row) {
  return [
    row.label,
    row.category,
    row.referencePrice == null ? 'No data' : `${formatCurrency(row.referencePrice)}/kg`,
    row.avgFarmerPrice == null ? '—' : `${formatCurrency(row.avgFarmerPrice)}/kg`,
    String(row.listingsCount),
    STATUS_META[row.status]?.label || row.status,
    row.isOverride ? `${formatCurrency(row.referencePrice)}/kg` : '—',
  ];
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportCommoditiesCsv(rows, filename = 'price-monitoring.csv') {
  const lines = [COLUMNS.join(','), ...rows.map((row) => toRowValues(row).map(csvEscape).join(','))];
  downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }), filename);
}

// A real .xlsx would need a heavier dependency (e.g. the full SheetJS lib) for what's just an
// admin export button — Excel/LibreOffice/Sheets all correctly open an HTML <table> saved
// with a .xls extension and the vnd.ms-excel MIME type, so this gets a genuine spreadsheet
// file (formatted cells, not a plain-text dump) with zero extra dependencies.
export function exportCommoditiesExcel(rows, filename = 'price-monitoring.xls') {
  const headerRow = `<tr>${COLUMNS.map((column) => `<th>${column}</th>`).join('')}</tr>`;
  const bodyRows = rows
    .map((row) => `<tr>${toRowValues(row).map((value) => `<td>${value}</td>`).join('')}</tr>`)
    .join('');
  const html = `<html><head><meta charset="utf-8"></head><body><table border="1">${headerRow}${bodyRows}</table></body></html>`;
  downloadBlob(new Blob([html], { type: 'application/vnd.ms-excel' }), filename);
}

export function exportCommoditiesPdf(rows, filename = 'price-monitoring.pdf') {
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(14);
  doc.text('HarvestLink — Price Monitoring Report', 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleString('en-PH')}`, 14, 21);
  autoTable(doc, {
    startY: 26,
    head: [COLUMNS],
    body: rows.map(toRowValues),
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [22, 101, 52] },
  });
  doc.save(filename);
}

export function exportCommodities(rows, format) {
  if (format === 'csv') return exportCommoditiesCsv(rows);
  if (format === 'excel') return exportCommoditiesExcel(rows);
  if (format === 'pdf') return exportCommoditiesPdf(rows);
  return undefined;
}
