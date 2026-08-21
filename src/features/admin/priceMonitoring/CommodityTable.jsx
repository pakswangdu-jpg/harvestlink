import { Fragment } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import Badge from '../../../components/admin/Badge';
import Button from '../../../components/admin/Button';
import Input from '../../../components/admin/Input';
import EmptyState from '../../../components/admin/EmptyState';
import { formatCurrency, formatRelativeTime } from '../../../utils/formatters';
import { STATUS_META } from './statusMeta';
import CommodityDetailPanel from './CommodityDetailPanel';

const SORTABLE_COLUMNS = {
  label: ['label-asc', 'label-desc'],
  referencePrice: ['price-asc', 'price-desc'],
  avgFarmerPrice: ['avgfarmer-asc', 'avgfarmer-desc'],
  listingsCount: ['listings-asc', 'listings-desc'],
};

function SortableHeader({
  label, sortKeys, sortState, onSort,
}) {
  const active = sortKeys.includes(sortState);
  const direction = active ? sortState.split('-')[1] : null;
  const nextKey = direction === 'asc' ? sortKeys[1] : sortKeys[0];
  return (
    <button
      type="button"
      onClick={() => onSort(nextKey)}
      className="inline-flex items-center gap-1 border-0 bg-transparent p-0 text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)] hover:text-[var(--text)]"
    >
      {label}
      <ChevronDown size={12} className={`transition-transform duration-150 ${active ? 'text-[var(--green-800)]' : 'text-[var(--line)]'} ${direction === 'asc' ? 'rotate-180' : ''}`} />
    </button>
  );
}

function highlightMatch(text, term) {
  if (!term) return text;
  const index = text.toLowerCase().indexOf(term.toLowerCase());
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-[var(--amber-100)] px-0 text-[var(--text)]">{text.slice(index, index + term.length)}</mark>
      {text.slice(index + term.length)}
    </>
  );
}

export default function CommodityTable({
  rows, searchTerm, sortState, onSort, selectedIds, onToggleSelect, onToggleSelectAll,
  expandedId, onToggleExpand, drafts, onDraftChange, onOpenOverrideModal, onResetOverride,
}) {
  if (!rows.length) {
    return <EmptyState title="No commodities match these filters" message="Try clearing the search or filters above." />;
  }

  const allOnPageSelected = rows.every((row) => selectedIds.has(row.id));

  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[1080px] border-collapse text-left text-[13px]">
        <thead className="sticky top-0 z-10 bg-[var(--soft)]">
          <tr>
            <th className="w-10 border-b border-[var(--line)] px-3 py-2 first:pl-5">
              <input type="checkbox" checked={allOnPageSelected} onChange={(event) => onToggleSelectAll(rows.map((row) => row.id), event.target.checked)} />
            </th>
            <th className="w-8 border-b border-[var(--line)] px-1 py-2" />
            <th className="whitespace-nowrap border-b border-[var(--line)] px-3 py-2">
              <SortableHeader label="Commodity" sortKeys={SORTABLE_COLUMNS.label} sortState={sortState} onSort={onSort} />
            </th>
            <th className="whitespace-nowrap border-b border-[var(--line)] px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">Category</th>
            <th className="whitespace-nowrap border-b border-[var(--line)] px-3 py-2">
              <SortableHeader label="PSA Reference Price" sortKeys={SORTABLE_COLUMNS.referencePrice} sortState={sortState} onSort={onSort} />
            </th>
            <th className="whitespace-nowrap border-b border-[var(--line)] px-3 py-2">
              <SortableHeader label="Avg Farmer Price" sortKeys={SORTABLE_COLUMNS.avgFarmerPrice} sortState={sortState} onSort={onSort} />
            </th>
            <th className="whitespace-nowrap border-b border-[var(--line)] px-3 py-2">
              <SortableHeader label="Listings" sortKeys={SORTABLE_COLUMNS.listingsCount} sortState={sortState} onSort={onSort} />
            </th>
            <th className="whitespace-nowrap border-b border-[var(--line)] px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">Status</th>
            <th className="whitespace-nowrap border-b border-[var(--line)] px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">Override Price</th>
            <th className="whitespace-nowrap border-b border-[var(--line)] px-3 py-2 pr-5 text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const meta = STATUS_META[row.status];
            const expanded = expandedId === row.id;
            return (
              <Fragment key={row.id}>
                <tr className="h-12 border-b border-[var(--line)] transition-colors duration-150 hover:bg-[var(--soft)]">
                  <td className="px-3 first:pl-5">
                    <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => onToggleSelect(row.id)} />
                  </td>
                  <td className="px-1">
                    <button
                      type="button"
                      onClick={() => onToggleExpand(row.id)}
                      aria-label={expanded ? 'Collapse' : 'Expand'}
                      className="flex h-6 w-6 items-center justify-center rounded-md border-0 bg-transparent p-0 text-[var(--muted)] hover:bg-[var(--soft)]"
                    >
                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-3 font-medium text-[var(--text)]">{highlightMatch(row.label, searchTerm)}</td>
                  <td className="whitespace-nowrap px-3 text-[var(--muted)]">{row.category}</td>
                  <td className="whitespace-nowrap px-3">
                    {row.loading ? (
                      <span className="text-[var(--muted)]">Loading…</span>
                    ) : row.referencePrice == null ? (
                      <div className="text-[var(--amber-700)]">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle size={13} />
                          <span>PSA reference unavailable</span>
                        </div>
                        {row.override?.updatedAt ? (
                          <p className="mt-0.5 pl-[19px] text-[11px] text-[var(--muted)]">Last updated {formatRelativeTime(row.override.updatedAt)}</p>
                        ) : null}
                      </div>
                    ) : (
                      <span>
                        {formatCurrency(row.referencePrice)}/kg
                        <span className="ml-1 text-[12px] text-[var(--muted)]">({row.referenceYear})</span>
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3">{row.avgFarmerPrice == null ? '—' : `${formatCurrency(row.avgFarmerPrice)}/kg`}</td>
                  <td className="whitespace-nowrap px-3">{row.listingsCount}</td>
                  <td className="whitespace-nowrap px-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                  <td className="px-3">
                    <div className="flex items-center gap-2 py-1">
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="₱/kg"
                        value={drafts[row.id] ?? ''}
                        onChange={(event) => onDraftChange(row.id, event.target.value)}
                        className="w-28"
                      />
                      <Button variant="primary" onClick={() => onOpenOverrideModal(row)}>Save</Button>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 pr-5">
                    {row.isOverride ? (
                      <Button variant="secondary" onClick={() => onResetOverride(row)}><RotateCcw size={13} /> Reset</Button>
                    ) : row.referencePrice == null ? (
                      <Button variant="secondary" onClick={() => onOpenOverrideModal(row)}>Set Manual Price</Button>
                    ) : null}
                  </td>
                </tr>
                {expanded ? (
                  <tr className="border-b border-[var(--line)]">
                    <td colSpan={10} className="p-0">
                      <CommodityDetailPanel row={row} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
