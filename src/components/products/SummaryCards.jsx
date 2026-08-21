import { Boxes, CheckCircle2, Info, Package, TriangleAlert } from 'lucide-react';

// Four cards, each with a colored top accent + label/info-icon row + a bold value — the
// seller-center-style card anatomy the user referenced. No vs-Previous-Month comparison:
// these are point-in-time counts (not counters we track historically), so a trend arrow
// here would have to be fabricated — this page has a standing "no fake data" rule.
const CARDS = [
  {
    key: 'total', label: 'Products', hint: 'listed', icon: Package, accent: 'neutral',
    tooltip: 'Total products you have ever listed, active or not.',
  },
  {
    key: 'active', label: 'Active', hint: 'listings', icon: CheckCircle2, accent: 'success',
    tooltip: 'Products currently visible to buyers in the marketplace.',
  },
  {
    key: 'lowStock', label: 'Low Stock', hint: 'needs attention', icon: TriangleAlert, accent: 'warning',
    tooltip: 'Active products at or below their low-stock threshold.',
  },
  {
    key: 'totalInventory', label: 'Inventory', hint: 'units in stock', icon: Boxes, accent: 'neutral',
    tooltip: 'Combined stock quantity across all your active products.',
  },
];

export default function SummaryCards({ summary }) {
  return (
    <div className="product-stats-bar">
      {CARDS.map(({ key, label, hint, icon: Icon, accent, tooltip }) => {
        const value = summary[key];
        const isWarning = accent === 'warning' && value > 0;
        return (
          <div key={key} className={`product-stats-item accent-${accent}`}>
            <div className="product-stats-label-row">
              <Icon size={13} className="product-stats-icon" aria-hidden="true" />
              <p className="product-stats-label">{label}</p>
              <span className="product-stats-info" title={tooltip}>
                <Info size={12} aria-hidden="true" />
              </span>
            </div>
            <p className={`product-stats-value ${isWarning ? 'warning' : ''}`}>{value}</p>
            <p className="product-stats-hint">{hint}</p>
          </div>
        );
      })}
    </div>
  );
}
