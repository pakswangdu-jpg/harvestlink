import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import PriceSparkline from './PriceSparkline';
import { fetchAnnualPriceTrend, getCommodityById, MARKET_REGION_LABEL } from '../../services/marketPriceService';
import { formatCurrency } from '../../utils/formatters';

export default function MarketPricePanel({ commodityId, perspective }) {
  const [result, setResult] = useState({ commodityId: null, points: null, error: '' });
  const commodity = getCommodityById(commodityId);
  const isLoading = result.commodityId !== commodityId;
  const points = isLoading ? null : result.points;
  const error = isLoading ? '' : result.error;

  useEffect(() => {
    let cancelled = false;

    fetchAnnualPriceTrend(commodityId, 5)
      .then((data) => {
        if (!cancelled) setResult({ commodityId, points: data, error: '' });
      })
      .catch(() => {
        if (!cancelled) setResult({ commodityId, points: null, error: 'Unable to load PSA market data right now.' });
      });

    return () => {
      cancelled = true;
    };
  }, [commodityId]);

  const valid = points ? points.filter((point) => point.price != null) : [];
  const latest = valid[valid.length - 1];
  const previous = valid[valid.length - 2];
  const change = latest && previous ? ((latest.price - previous.price) / previous.price) * 100 : null;
  const isFavorable = change == null ? null : perspective === 'farmer' ? change >= 0 : change <= 0;

  return (
    <section className="panel market-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Market insights</p>
          <h2>{commodity.label} — Farmgate Price</h2>
        </div>
        <Link className="btn btn-secondary btn-md" to="/market-insights">
          <TrendingUp size={16} /> View trends
        </Link>
      </div>

      {error ? <p className="muted">{error}</p> : null}
      {!error && !points ? <p className="muted">Loading PSA market data…</p> : null}

      {!error && points ? (
        latest ? (
          <div className="market-stat">
            <div>
              <strong className="market-stat-value">
                {formatCurrency(latest.price)}<small>/kg</small>
              </strong>
              <p className="muted">{MARKET_REGION_LABEL} • {latest.year} annual average</p>
              {change != null ? (
                <span className={`market-delta ${isFavorable ? 'good' : 'bad'}`}>
                  {change >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {Math.abs(change).toFixed(1)}% vs {previous.year}
                </span>
              ) : null}
            </div>
            <PriceSparkline points={points} />
          </div>
        ) : (
          <p className="muted">No PSA data available for this crop yet.</p>
        )
      ) : null}

      <p className="market-source">Source: Philippine Statistics Authority (PSA) OpenStat.</p>
    </section>
  );
}
