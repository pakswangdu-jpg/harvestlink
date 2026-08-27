import { ArrowRight, ClipboardList, Package, TrendingUp, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';

// Same flat .product-stats-bar/.product-stats-item pattern BuyerOrders.jsx and
// FarmerOrders.jsx already use for their own summary bars — one shared visual language for
// "row of stat cards" across the app instead of this page keeping its own heavier,
// boxed-icon/top-border/tooltip treatment. Products and Orders keep their extra secondary
// stat line, and Orders keeps its "View orders" link, since those carry real information the
// simpler cards don't need — everything else (the tooltip, the colored icon badge, the
// all-caps tracked label) was decoration, not data, so it's gone.
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
    <section className="panel metrics-overview-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Business overview</p>
          <h2>Business overview</h2>
          <p className="dashboard-chart-helper">Track your sales, earnings, active listings, and incoming orders.</p>
        </div>
      </div>
      <div className="product-stats-bar metrics-overview">
        {cards.map((card) => <OverviewCard key={card.title} {...card} />)}
      </div>
    </section>
  );
}

// Profit is the only card with genuine good/bad framing (a positive figure vs. a loss);
// Orders is pending work waiting on the farmer. Total income and Products are plain counts —
// no accent, same as "Total Orders" gets no accent on BuyerOrders.jsx's own stats bar.
const ACCENT_BY_TONE = {
  profit: 'success',
  orders: 'warning',
};

function OverviewCard({
  title, metric, secondary, icon: Icon, tone, href,
}) {
  if (!metric) return null;
  const accent = ACCENT_BY_TONE[tone];

  return (
    <div className={`product-stats-item${accent ? ` accent-${accent}` : ''}`}>
      <div className="product-stats-label-row">
        <Icon size={16} className="product-stats-icon" aria-hidden="true" />
        <p className="product-stats-label">{title}</p>
      </div>
      <p className="product-stats-value">
        {metric.value}
        {metric.trend ? <TrendingUp size={15} className="metrics-overview-trend" aria-hidden="true" /> : null}
      </p>
      <p className="product-stats-hint">{metric.hint || metric.label}</p>
      {secondary ? (
        <p className="metrics-overview-secondary"><strong>{secondary.value}</strong> {secondary.label}</p>
      ) : null}
      {href ? (
        <Link className="metrics-overview-cta" to={href}>View orders <ArrowRight size={14} strokeWidth={2.25} aria-hidden="true" /></Link>
      ) : null}
    </div>
  );
}
