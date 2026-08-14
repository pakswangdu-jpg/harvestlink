import { Boxes, ClipboardCheck, ListChecks, TriangleAlert } from 'lucide-react';
import KpiGrid from '../common/KpiGrid';
import KpiCard from '../common/KpiCard';

export default function SummaryCards({ summary }) {
  return (
    <KpiGrid>
      <KpiCard label="Total Products" value={summary.total} hint="Products listed" icon={ClipboardCheck} />
      <KpiCard label="Active Listings" value={summary.active} hint="Currently active" icon={ListChecks} />
      <KpiCard label="Low Stock" value={summary.lowStock} hint="Needs attention" icon={TriangleAlert} variant="warning" />
      <KpiCard label="Total Inventory" value={summary.totalInventory} hint="Units in stock" icon={Boxes} />
    </KpiGrid>
  );
}
