import { ArrowRight, ClipboardList, Info, Package, TrendingUp, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';

// Financial gets its own wide, visually dominant block (value-first, larger type, subtle green
// tint) since income/profit is the metric a farmer cares about most. Products and Orders are
// identical in shape — a labeled panel of stacked value/label pairs — so they share
// SecondaryPanel instead of duplicating that markup twice.
export default function MetricsSummary({ financialMetrics, productMetrics, orderMetrics }) {
  const cards = [
    { title: 'Total income', metric: financialMetrics[0], icon: TrendingUp, tone: 'income' },
    { title: 'Profit', metric: financialMetrics[1], icon: Wallet, tone: 'profit' },
    {
      title: 'Products',
      metric: productMetrics[1] || productMetrics[0],
      secondary: productMetrics[1] ? productMetrics[0] : null,
      icon: Package,
      tone: 'products',
    },
    { title: 'Orders', metric: orderMetrics[0], secondary: orderMetrics[1], icon: ClipboardList, tone: 'orders', href: '/farmer-orders' },
  ];

  return (
    <section className="metrics-summary metrics-overview">
      <div className="metrics-overview-grid">
        {cards.map((card) => <OverviewCard key={card.title} {...card} />)}
      </div>
    </section>
  );
}

function OverviewCard({ title, metric, secondary, icon: Icon, tone, href }) {
  if (!metric) return null;

  const tooltip = {
    'Total income': 'Total value of paid orders recorded during the selected period.',
    Profit: 'Profit is calculated from recorded income minus recorded costs.',
    Products: 'Number of products currently listed in your inventory.',
    Orders: 'Orders currently awaiting processing or confirmation.',
  }[title];

  return (
    <article className={`metrics-overview-card tone-${tone}`}>
      <div className="metrics-overview-card-copy">
        <div className="metrics-overview-card-heading">
          <span>{title}</span>
          <span className="metrics-overview-info" tabIndex="0" role="img" aria-label={tooltip} data-tooltip={tooltip}>
            <Info size={14} strokeWidth={2} aria-hidden="true" />
          </span>
        </div>
        <strong className="metrics-overview-value">
          {metric.value}
          {metric.trend ? <TrendingUp size={17} strokeWidth={2.5} aria-hidden="true" /> : null}
        </strong>
        <span className="metrics-overview-label">{metric.hint || metric.label}</span>
        {secondary ? (
          <span className="metrics-overview-secondary"><strong>{secondary.value}</strong> {secondary.label}</span>
        ) : null}
        {href ? (
          <Link className="metrics-overview-cta" to={href}>View orders <ArrowRight size={14} strokeWidth={2.25} aria-hidden="true" /></Link>
        ) : null}
      </div>
      <span className="metrics-overview-icon"><Icon size={21} strokeWidth={2} aria-hidden="true" /></span>
    </article>
  );
}
