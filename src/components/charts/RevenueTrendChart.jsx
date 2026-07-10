import { useState } from 'react';
import { formatCurrency } from '../../utils/formatters';

const WIDTH = 640;
const HEIGHT = 260;
const PAD_LEFT = 72;
const PAD_RIGHT = 20;
const PAD_TOP = 24;
const PAD_BOTTOM = 36;

function niceTicks(min, max, count = 4) {
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const rounded = Array.from({ length: count }, (_, index) => Math.round(min + step * index));
  return [...new Set(rounded)];
}

export default function RevenueTrendChart({ points }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const values = points.map((point) => point.revenue);

  if (!values.some((value) => value > 0)) {
    return (
      <div className="empty-state compact">
        <h3>No revenue yet</h3>
        <p>Paid orders will chart here once buyers start checking out.</p>
      </div>
    );
  }

  const minValue = 0;
  const maxValue = Math.max(...values) || 1;
  const chartWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const chartHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const xForIndex = (index) => PAD_LEFT + (points.length === 1 ? chartWidth / 2 : (index / (points.length - 1)) * chartWidth);
  const yForValue = (value) => PAD_TOP + chartHeight - ((value - minValue) / (maxValue - minValue || 1)) * chartHeight;

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${xForIndex(index).toFixed(1)},${yForValue(point.revenue).toFixed(1)}`).join(' ');
  const yTicks = niceTicks(minValue, maxValue, 4);
  const hovered = hoverIndex != null ? points[hoverIndex] : null;

  return (
    <div className="price-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Monthly revenue trend">
        {yTicks.map((tick) => {
          const y = yForValue(tick);
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
          <text key={`x-${point.label}`} x={xForIndex(index)} y={HEIGHT - 10} className="chart-axis-label" textAnchor="middle">
            {point.label}
          </text>
        ))}

        <path d={path} className="chart-line" fill="none" />

        {points.map((point, index) => {
          const x = xForIndex(index);
          const y = yForValue(point.revenue);
          return (
            <g key={point.label}>
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
                aria-label={`${point.label}: ${formatCurrency(point.revenue)}`}
                onMouseEnter={() => setHoverIndex(index)}
                onMouseLeave={() => setHoverIndex((current) => (current === index ? null : current))}
                onFocus={() => setHoverIndex(index)}
                onBlur={() => setHoverIndex((current) => (current === index ? null : current))}
              />
            </g>
          );
        })}
      </svg>

      {hovered ? (
        <div className="chart-tooltip" style={{ left: `${(xForIndex(hoverIndex) / WIDTH) * 100}%` }}>
          <strong>{formatCurrency(hovered.revenue)}</strong>
          <span>{hovered.label}</span>
        </div>
      ) : null}
    </div>
  );
}
