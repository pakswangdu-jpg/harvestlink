import { useId } from 'react';
import { Boxes, CircleCheck, Package, TriangleAlert } from 'lucide-react';
import './SummaryCards.css';

const CARDS = [
  {
    key: 'total', label: 'Products', hint: 'Total products', emptyHint: 'No products yet', icon: Package,
    description: 'All products in your inventory, including inactive listings.',
  },
  {
    key: 'active', label: 'Active Listings', hint: 'Currently available', emptyHint: 'No active listings', icon: CircleCheck,
    description: 'Products with an Active stock status. Low-stock products are counted separately.',
  },
  {
    key: 'lowStock', label: 'Low Stock', hint: 'Needs attention', emptyHint: 'Nothing to review', icon: TriangleAlert,
    description: 'Products at or below their low-stock threshold.',
  },
  {
    key: 'totalInventory', label: 'Units in Stock', hint: 'Total inventory', emptyHint: 'No inventory yet', icon: Boxes,
    description: 'Combined stock quantity across all your products, in their listed units.',
  },
];

export default function SummaryCards({ summary, action, isLoading = false, hasError = false }) {
  const headingId = useId();
  const hasProducts = summary.total > 0;
  const isUnavailable = isLoading || hasError;

  return (
    <section className="inventory-overview" aria-labelledby={headingId} aria-busy={isLoading}>
      <div className="inventory-overview-header">
        <div>
          <h2 className="inventory-overview-title" id={headingId}>Inventory Overview</h2>
          <p className="inventory-overview-description">Monitor your listings and current stock levels.</p>
        </div>
        {action}
      </div>
      <dl className="inventory-overview-grid">
        {CARDS.map(({ key, label, hint, emptyHint, icon: Icon, description }) => {
          const value = summary[key];
          const isWarning = !isUnavailable && key === 'lowStock' && value > 0;
          const isActive = !isUnavailable && key === 'active' && value > 0;
          const supportingText = isLoading ? 'Loading inventory…'
            : hasError ? 'Inventory unavailable'
              : !hasProducts ? emptyHint
                : key === 'lowStock' && value === 0 ? 'Stock levels healthy'
                  : key === 'active' && value === 0 ? emptyHint : hint;

          return (
            <div key={key} className={`inventory-metric${isWarning ? ' inventory-metric-warning' : ''}${isActive ? ' inventory-metric-active' : ''}`}>
              <dt className="inventory-metric-label" title={description}>
                <span>{label}</span>
                <Icon size={20} strokeWidth={2} className="inventory-metric-icon" aria-hidden="true" />
              </dt>
              <dd className="inventory-metric-value">{isUnavailable ? '—' : value}</dd>
              <dd className="inventory-metric-hint">{supportingText}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
