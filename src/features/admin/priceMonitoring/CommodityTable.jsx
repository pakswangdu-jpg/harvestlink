import { Fragment, useSyncExternalStore } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import Badge from '../../../components/admin/Badge';
import { formatCurrency } from '../../../utils/formatters';
import { STATUS_META } from './statusMeta';
import CommodityDetailPanel from './CommodityDetailPanel';
import { priceDifference } from './pricePresentation';

const SORTS = { label: ['label-asc', 'label-desc'], referencePrice: ['price-asc', 'price-desc'], avgFarmerPrice: ['avgfarmer-asc', 'avgfarmer-desc'], listingsCount: ['listings-asc', 'listings-desc'] };
const subscribeViewport = (callback) => {
  const query = window.matchMedia('(max-width: 800px)');
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
};
const mobileSnapshot = () => window.matchMedia('(max-width: 800px)').matches;

export default function CommodityTable({ rows, sortState, onSort, selectedIds, onToggleSelect, onToggleSelectAll, expandedId, onToggleExpand, onOpenOverrideModal, onResetOverride }) {
  const mobile = useSyncExternalStore(subscribeViewport, mobileSnapshot, () => false);
  if (!rows.length) return <p className="pm-empty">No commodities match these filters. Try another search or clear the filters.</p>;
  const header = (label, key) => <button type="button" onClick={() => onSort(sortState === SORTS[key][0] ? SORTS[key][1] : SORTS[key][0])}>{label}<ChevronDown size={12} aria-hidden="true" /></button>;
  const details = (row) => <CommodityDetailPanel row={row} onOpenOverride={onOpenOverrideModal} onResetOverride={onResetOverride} />;
  const reference = (row) => row.loading ? 'Loading...' : row.psaPrice == null ? 'No PSA data' : <>{formatCurrency(row.psaPrice)}/kg<small>PSA {row.psaYear}</small></>;
  const difference = (row) => row.loading || row.unit !== 'kg' ? null : priceDifference(row.avgFarmerPrice, row.referencePrice);
  const status = (row) => row.loading ? <span className="pm-secondary">Loading</span> : <Badge tone={STATUS_META[row.status].tone}>{STATUS_META[row.status].label}</Badge>;
  const selection = (row) => <input type="checkbox" aria-label={`Select ${row.label}`} checked={selectedIds.has(row.id)} onChange={() => onToggleSelect(row.id)} disabled={row.loading} />;
  const adminReference = (row) => row.isOverride
    ? <>{formatCurrency(row.override?.referencePrice ?? row.referencePrice)}/{row.override?.unit || row.unit}<small>{row.override?.source === 'verified_local_market' ? 'Verified local survey' : 'Admin-entered'}</small></>
    : <span className="pm-secondary">Not set</span>;
  const effectiveReference = (row) => row.loading
    ? 'Loading...'
    : row.referencePrice == null
      ? 'Unavailable'
      : <>{formatCurrency(row.referencePrice)}/{row.unit}{' '}<small>{row.isOverride ? (row.override?.source === 'verified_local_market' ? 'Verified local survey' : 'Admin-entered') : `PSA ${row.referenceYear || ''}`}</small></>;
  return <>
    <div className="pm-desktop-table">
      <table className="pm-table">
        <thead><tr>
          <th><input type="checkbox" aria-label="Select loaded commodities on this page" checked={rows.some((row) => !row.loading) && rows.filter((row) => !row.loading).every((row) => selectedIds.has(row.id))} onChange={(event) => onToggleSelectAll(rows.filter((row) => !row.loading).map((row) => row.id), event.target.checked)} /></th>
          <th>{header('Commodity', 'label')}</th><th>Category</th><th>PSA reference</th><th>Admin reference</th><th>Effective reference</th><th>{header('Farmer avg.', 'avgFarmerPrice')}</th><th>Difference vs ref.</th><th>{header('Listings', 'listingsCount')}</th><th>Status</th><th>Action</th>
        </tr></thead>
        <tbody>{rows.map((row) => <Fragment key={row.id}>
          <tr>
            <td>{selection(row)}</td>
            <td><button className="pm-expand" type="button" aria-expanded={expandedId === row.id} onClick={() => onToggleExpand(row.id)}>{expandedId === row.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{row.label}</button></td>
            <td className="pm-secondary">{row.category}</td><td>{reference(row)}</td><td>{adminReference(row)}</td><td>{effectiveReference(row)}</td><td>{row.avgFarmerPrice == null ? '-' : `${formatCurrency(row.avgFarmerPrice)}/kg`}</td>
            <td>{difference(row)?.label || '-'}</td><td>{row.listingsCount}</td><td>{status(row)}</td>
            <td><button type="button" className="pm-link" disabled={row.loading} onClick={() => onOpenOverrideModal(row)}>{row.isOverride ? 'Edit override' : 'Set price'}</button></td>
          </tr>
          {!mobile && expandedId === row.id && <tr><td colSpan={11} className="pm-detail-cell">{details(row)}</td></tr>}
        </Fragment>)}</tbody>
      </table>
    </div>
    <div className="pm-mobile-records">{rows.map((row) => <article key={row.id}>
      <div className="pm-record-heading">{selection(row)}<div><h3>{row.label}</h3><small>{row.category}</small></div>{status(row)}</div>
      <dl className="pm-record-prices"><div><dt>PSA reference</dt><dd>{reference(row)}</dd></div><div><dt>Admin reference</dt><dd>{adminReference(row)}</dd></div><div><dt>Effective reference</dt><dd>{effectiveReference(row)}</dd></div><div><dt>Farmer average</dt><dd>{row.avgFarmerPrice == null ? '-' : `${formatCurrency(row.avgFarmerPrice)}/kg`}</dd></div></dl>
      <div className="pm-record-footer"><span>{difference(row)?.label || 'No comparison available'}</span><button className="pm-link" type="button" aria-expanded={expandedId === row.id} onClick={() => onToggleExpand(row.id)}>{expandedId === row.id ? 'Close details' : 'View details'}<ChevronRight size={14} /></button></div>
      {mobile && expandedId === row.id && details(row)}
    </article>)}</div>
  </>;
}
