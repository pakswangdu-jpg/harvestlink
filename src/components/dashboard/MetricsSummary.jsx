import { ArrowRight, ClipboardList, Package, TrendingUp, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import './MetricsSummary.css';








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
    <section className="panel metrics-overview-panel business-summary">
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




const ACCENT_BY_TONE = {
  profit: 'success',
  orders: 'warning',
};

function OverviewCard({
  title, metric, secondary, icon: Icon, tone, href,
}) {
  if (!metric) return null;
  const accent = ACCENT_BY_TONE[tone];
  const chartPoints = metric.chartPoints || [];
  const hasChartData = chartPoints.some((point) => Number.isFinite(point.revenue) && point.revenue !== 0);
  const chartValues = chartPoints.map((point) => point.revenue);
  const minValue = Math.min(0, ...chartValues);
  const maxValue = Math.max(0, ...chartValues);
  const range = maxValue - minValue;
  const coordinates = chartPoints.map((point, index) => ({
    x: chartPoints.length > 1 ? (index / (chartPoints.length - 1)) * 280 : 140,
    y: 34 - (range ? ((point.revenue - minValue) / range) * 26 : 13),
  }));
  const linePath = coordinates.map(({ x, y }, index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ');
  const zeroY = 34 - (range ? ((0 - minValue) / range) * 26 : 13);
  const areaPath = coordinates.length
    ? `${linePath} L ${coordinates.at(-1).x} ${zeroY} L ${coordinates[0].x} ${zeroY} Z`
    : '';

  return (
    <div className={`product-stats-item${accent ? ` accent-${accent}` : ''}${metric.chartPoints ? ' has-financial-trend' : ''}`}>
      <div className="product-stats-label-row">
        <Icon size={16} className="product-stats-icon" aria-hidden="true" />
        <p className="product-stats-label">{title}</p>
      </div>
      <div className="business-summary-number-row">
        <p className="product-stats-value">{metric.value}</p>
        {metric.trend ? <TrendingUp size={15} className="metrics-overview-trend" aria-hidden="true" /> : null}
      </div>
      <p className="product-stats-hint">{metric.hint || metric.label}</p>
      {metric.chartPoints ? (
        <div className={`metrics-overview-mini-trend${hasChartData ? '' : ' is-empty'}`}>
          {hasChartData ? (
            <>
              <span>Last 6 months</span>
              <svg viewBox="0 0 280 40" preserveAspectRatio="none" role="img" aria-label={`${title} over the last 6 months`}>
                <path d={areaPath} className="metrics-overview-mini-trend-area" />
                <path d={linePath} className="metrics-overview-mini-trend-line" />
              </svg>
            </>
          ) : <span>No trend data yet</span>}
        </div>
      ) : null}
      {secondary ? (
        <p className="metrics-overview-secondary"><strong>{secondary.value}</strong> {secondary.label}</p>
      ) : null}
      {href ? (
        <Link className="metrics-overview-cta" to={href}>View orders <ArrowRight size={14} strokeWidth={2.25} aria-hidden="true" /></Link>
      ) : null}
    </div>
  );
}
