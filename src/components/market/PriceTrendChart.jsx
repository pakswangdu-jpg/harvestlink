import { useState } from 'react';
import { formatCurrency } from '../../utils/formatters';

const WIDTH = 640;
const HEIGHT = 260;
const PAD_LEFT = 64;
const PAD_RIGHT = 20;
const PAD_TOP = 24;
const PAD_BOTTOM = 36;

function niceTicks(min, max, count = 4) {
  if (!(max > min)) return [min];
  const range = max - min;
  const rawStep = range / (count - 1);
  const decimals = rawStep < 1 ? 2 : rawStep < 10 ? 1 : 0;
  const ticks = Array.from({ length: count }, (_, index) =>
    Number((min + rawStep * index).toFixed(decimals)));
  return [...new Set(ticks)];
}





export default function PriceTrendChart({
  points,
  valueKey = 'price',
  formatValue = formatCurrency,
  emptyTitle = 'Not enough data',
  emptyMessage = "PSA hasn't published enough farmgate price data for this crop in this region yet.",
  chartAriaLabel = 'Farmgate price trend by year',
  pointAriaSuffix = 'per kilogram',
  tooltipCaption = 'annual average',
  xAxisLabel = 'year',
}) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const validPrices = points.filter((point) => point[valueKey] != null).map((point) => point[valueKey]);

  if (validPrices.length < 2) {
    return (
      <div className="empty-state compact">
        <h3>{emptyTitle}</h3>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const minPrice = Math.min(...validPrices);
  const maxPrice = Math.max(...validPrices);
  const spread = maxPrice - minPrice;
  const baseRange = spread > 0 ? spread : Math.max(maxPrice * 0.2, 1);
  const yMin = Math.max(0, minPrice - (spread > 0 ? baseRange * 0.25 : baseRange * 0.5));
  const yMax = maxPrice + (spread > 0 ? baseRange * 0.25 : baseRange * 0.5);

  const formatXAxis = (point) => {
    const value = String(point?.[xAxisLabel] ?? '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [, month, day] = value.split('-');
      return `${month}/${day}`;
    }
    return value.length > 10 ? value.slice(0, 10) : value;
  };

  const chartWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const chartHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const xForIndex = (index) => PAD_LEFT + (points.length === 1 ? chartWidth / 2 : (index / (points.length - 1)) * chartWidth);
  const yForValue = (value) => PAD_TOP + chartHeight - ((value - yMin) / (yMax - yMin || 1)) * chartHeight;

  let path = '';
  let drawing = false;
  points.forEach((point, index) => {
    if (point[valueKey] == null) {
      drawing = false;
      return;
    }
    const x = xForIndex(index);
    const y = yForValue(point[valueKey]);
    path += `${drawing ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `;
    drawing = true;
  });

  const yTicks = niceTicks(yMin, yMax, 4);
  const hovered = hoverIndex != null ? points[hoverIndex] : null;
  const tooltipLeft = hoverIndex == null ? 50 : Math.min(88, Math.max(12, (xForIndex(hoverIndex) / WIDTH) * 100));
  const xLabelStep = points.length > 6 ? Math.ceil(points.length / 4) : 1;

  return (
    <div className="price-chart">
      <div className="price-chart-summary" aria-label="Chart summary">
        <span><strong>{formatValue(maxPrice)}</strong> high</span>
        <span><strong>{formatValue(minPrice)}</strong> low</span>
        <span>{validPrices.length} data point{validPrices.length === 1 ? '' : 's'}</span>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={chartAriaLabel}>
        {yTicks.map((tick) => {
          const y = yForValue(tick);
          return (
            <g key={tick}>
              <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y} y2={y} className="chart-gridline" />
              <text x={PAD_LEFT - 10} y={y} className="chart-axis-label" textAnchor="end" dominantBaseline="middle">
                {formatValue(tick)}
              </text>
            </g>
          );
        })}

        {points.map((point, index) => {
          if (index % xLabelStep !== 0 && index !== points.length - 1) return null;
          return (
            <text key={`x-${index}-${point[xAxisLabel]}`} x={xForIndex(index)} y={HEIGHT - 10} className="chart-axis-label" textAnchor="middle">
              {formatXAxis(point)}
            </text>
          );
        })}

        <path d={path.trim()} className="chart-line" fill="none" />

        {points.map((point, index) => {
          if (point[valueKey] == null) return null;
          const x = xForIndex(index);
          const y = yForValue(point[valueKey]);
          return (
            <g key={point.year}>
              {hoverIndex === index ? (
                <line x1={x} x2={x} y1={PAD_TOP} y2={HEIGHT - PAD_BOTTOM} className="chart-crosshair" />
              ) : null}
              <circle cx={x} cy={y} r="4" className="chart-dot" />
              <circle
                cx={x}
                cy={y}
                r="14"
                className="chart-hit-target"
                tabIndex={0}
                role="button"
                aria-label={`${point.year}: ${formatValue(point[valueKey])} ${pointAriaSuffix}`}
                onMouseEnter={() => setHoverIndex(index)}
                onMouseLeave={() => setHoverIndex((current) => (current === index ? null : current))}
                onFocus={() => setHoverIndex(index)}
                onBlur={() => setHoverIndex((current) => (current === index ? null : current))}
                onClick={() => setHoverIndex((current) => current === index ? null : index)}
              />
            </g>
          );
        })}
      </svg>

      {hovered && hovered[valueKey] != null ? (
        <div className="chart-tooltip" style={{ left: `${tooltipLeft}%` }}>
          <strong>{formatValue(hovered[valueKey])}</strong>
          <span>{formatXAxis(hovered)} {tooltipCaption}</span>
        </div>
      ) : null}
    </div>
  );
}
