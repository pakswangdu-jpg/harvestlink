import { ClipboardList, Package, TrendingUp, Wallet } from 'lucide-react';

// Financial gets its own wide, visually dominant block (value-first, larger type, subtle green
// tint) since income/profit is the metric a farmer cares about most. Products and Orders are
// identical in shape — a labeled panel of stacked value/label pairs — so they share
// SecondaryPanel instead of duplicating that markup twice.
export default function MetricsSummary({ financialMetrics, productMetrics, orderMetrics }) {
  return (
    <section className="metrics-summary">
      <div className="metrics-financial">
        <div className="metrics-section-heading">
          <span>Financial</span>
          <Wallet size={18} strokeWidth={2} aria-hidden="true" />
        </div>
        <div className="metrics-financial-row">
          {financialMetrics.map((metric) => (
            <div className="metric-block" key={metric.label}>
              <strong className="metric-value">
                {metric.value}
                {metric.trend ? <TrendingUp size={16} strokeWidth={2.5} className="metric-trend" aria-hidden="true" /> : null}
              </strong>
              <span className="metric-label">{metric.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="metrics-secondary">
        <SecondaryPanel icon={Package} label="Products" metrics={productMetrics} />
        <SecondaryPanel icon={ClipboardList} label="Orders" metrics={orderMetrics} />
      </div>
    </section>
  );
}

function SecondaryPanel({ icon: Icon, label, metrics }) {
  return (
    <div className="metrics-secondary-panel">
      <div className="metrics-section-heading metrics-section-heading-muted">
        <Icon size={16} strokeWidth={2} aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div className="metrics-secondary-list">
        {metrics.map((metric) => (
          <div className="metric-block" key={metric.label}>
            <strong className={`metric-value metric-value-compact${metric.tone ? ` tone-${metric.tone}` : ''}`}>
              {metric.value}
            </strong>
            <span className="metric-label">{metric.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
