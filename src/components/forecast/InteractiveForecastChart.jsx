import { useState } from 'react';
import { Gauge, TrendingUp, Wallet } from 'lucide-react';
import PriceForecastChart from './PriceForecastChart';
import DemandForecastChart from './DemandForecastChart';
import { formatCurrency } from '../../utils/formatters';

const TABS = [
  { value: 'price', label: 'Price' },
  { value: 'demand', label: 'Demand' },
  { value: 'historical', label: 'Historical' },
];

function SummaryCard({ icon: Icon, label, value, tone = 'text-gray-900' }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        <Icon size={13} /> {label}
      </p>
      <p className={`mt-1.5 text-[18px] font-bold ${tone}`}>{value}</p>
    </div>
  );
}

// One chart, three tabs. Every tab reuses data the page already fetched for the selected
// crop (see getCropForecastDetail) — switching tabs is local state only, never a new request.
export default function InteractiveForecastChart({ detail, forecast }) {
  const [tab, setTab] = useState('price');
  if (!detail) return null;

  const unit = detail.unit || forecast?.unit;

  return (
    <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest text-green-700">Forecast Chart</p>
          <h3 className="mt-1 text-[18px] font-bold text-gray-900">{detail.crop || forecast?.crop}</h3>
        </div>
        {/* Scrolls horizontally on narrow screens instead of shrinking 4 tabs into
            unreadable pills or blowing out the page width — the standard mobile pattern
            for a tab strip that doesn't fit. */}
        <div className="max-w-full overflow-x-auto">
          <div className="flex w-max shrink-0 gap-1.5 rounded-full border border-gray-200 bg-gray-50 p-1">
            {TABS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setTab(item.value)}
                className={`h-8 shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition-colors duration-200 ${
                  tab === item.value ? 'bg-green-700 text-white shadow-sm' : 'text-gray-600 hover:text-green-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5">
        {tab === 'price' ? (
          <PriceForecastChart
            eyebrow="Price Forecast"
            title="Historical & Forecast Price"
            historicalChart={detail.historicalChart}
            forecastCurve={detail.forecastCurve}
            todayIso={detail.forecastCurve[0]?.date}
            currentPrice={detail.currentPrice}
            unit={unit}
            weatherImpact={detail.weatherImpact}
            bestTimeToSell={detail.bestTimeToSell}
          />
        ) : null}
        {tab === 'demand' ? (
          <DemandForecastChart
            historicalChart={detail.demandHistoricalChart}
            forecastCurve={detail.demandForecastCurve}
            todayIso={detail.demandForecastCurve[0]?.date}
            unit={unit || 'unit'}
          />
        ) : null}
        {tab === 'historical' ? (
          <PriceForecastChart
            eyebrow="Recorded Order Prices"
            title="Historical Price Trend"
            historicalChart={detail.historicalChart}
            forecastCurve={[]}
            todayIso={detail.forecastCurve[0]?.date}
            currentPrice={detail.currentPrice}
            unit={unit}
          />
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard icon={Wallet} label="Current Price" value={`${formatCurrency(detail.currentPrice)}${unit ? `/${unit}` : ''}`} />
        <SummaryCard icon={Wallet} label="Forecast Price" value={`${formatCurrency(detail.forecastPrice)}${unit ? `/${unit}` : ''}`} />
        <SummaryCard
          icon={TrendingUp}
          label="Expected Increase"
          value={`${detail.expectedChangePercent > 0 ? '+' : ''}${detail.expectedChangePercent}%`}
          tone={detail.expectedChangePercent >= 0 ? 'text-green-700' : 'text-red-700'}
        />
        <SummaryCard icon={Gauge} label="AI Confidence" value={`${detail.confidence}%`} />
      </div>
    </div>
  );
}
