import { useState } from 'react';
import { formatCurrency } from '../../utils/formatters';

const WIDTH = 640;
const HEIGHT = 260;
const PAD_LEFT = 64;
const PAD_RIGHT = 20;
const PAD_TOP = 24;
const PAD_BOTTOM = 36;

function niceTicks(min, max, count = 4) {
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const rounded = Array.from({ length: count }, (_, index) => Math.round(min + step * index));
  // A narrow min/max range can round two distinct steps to the same integer —
  // de-dupe so two gridlines/labels never render on top of each other with the same key.
  return [...new Set(rounded)];
}

export default function PriceTrendChart({ points }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const validPrices = points.filter((point) => point.price != null).map((point) => point.price);

  if (validPrices.length < 2) {
    return (
      <div className="empty-state compact">
        <h3>Not enough data</h3>
        <p>PSA hasn't published enough farmgate price data for this crop in this region yet.</p>
      </div>
    );
  }

  const minPrice = Math.min(...validPrices);
  const maxPrice = Math.max(...validPrices);
  const spread = maxPrice - minPrice || maxPrice * 0.2 || 1;
  const yMin = Math.max(0, Math.floor(minPrice - spread * 0.2));
  const yMax = Math.ceil(maxPrice + spread * 0.2);

  const chartWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const chartHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const xForIndex = (index) => PAD_LEFT + (points.length === 1 ? chartWidth / 2 : (index / (points.length - 1)) * chartWidth);
  const yForPrice = (price) => PAD_TOP + chartHeight - ((price - yMin) / (yMax - yMin || 1)) * chartHeight;

  let path = '';
  let drawing = false;
  points.forEach((point, index) => {
    if (point.price == null) {
      drawing = false;
      return;
    }
    const x = xForIndex(index);
    const y = yForPrice(point.price);
    path += `${drawing ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `;
    drawing = true;
  });

  const yTicks = niceTicks(yMin, yMax, 4);
  const hovered = hoverIndex != null ? points[hoverIndex] : null;

  return (
    <div className="price-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Farmgate price trend by year">
        {yTicks.map((tick) => {
          const y = yForPrice(tick);
          return (
            <g key={tick}>
              <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y} y2={y} className="chart-gridline" />
              <text x={PAD_LEFT - 10} y={y} className="chart-axis-label" textAnchor="end" dominantBaseline="middle">
                {formatCurrency(tick)}
              </text>
            </g>
          );
        })}

        {points.map((point, index) => (
          <text key={`x-${point.year}`} x={xForIndex(index)} y={HEIGHT - 10} className="chart-axis-label" textAnchor="middle">
            {point.year}
          </text>
        ))}

        <path d={path.trim()} className="chart-line" fill="none" />

        {points.map((point, index) => {
          if (point.price == null) return null;
          const x = xForIndex(index);
          const y = yForPrice(point.price);
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
                aria-label={`${point.year}: ${formatCurrency(point.price)} per kilogram`}
                onMouseEnter={() => setHoverIndex(index)}
                onMouseLeave={() => setHoverIndex((current) => (current === index ? null : current))}
                onFocus={() => setHoverIndex(index)}
                onBlur={() => setHoverIndex((current) => (current === index ? null : current))}
              />
            </g>
          );
        })}
      </svg>

      {hovered && hovered.price != null ? (
        <div className="chart-tooltip" style={{ left: `${(xForIndex(hoverIndex) / WIDTH) * 100}%` }}>
          <strong>{formatCurrency(hovered.price)}</strong>
          <span>{hovered.year} annual average</span>
        </div>
      ) : null}
    </div>
  );
}
