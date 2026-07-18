import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatCurrency } from '../../utils/formatters';

const WIDTH = 640;
const HEIGHT = 260;
const PAD_LEFT = 72;
const PAD_RIGHT = 20;
const PAD_TOP = 42;
const PAD_BOTTOM = 36;
const GRADIENT_ID = 'revenue-trend-fill';
// The line finishes drawing at this point in the timeline — the peak callout waits until
// then so it doesn't pop in before the curve has actually reached it.
const LINE_DRAW_DURATION_S = 1.1;

function niceTicks(min, max, count = 4) {
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const rounded = Array.from({ length: count }, (_, index) => Math.round(min + step * index));
  return [...new Set(rounded)];
}

// Catmull-Rom -> cubic Bezier (tension 1/6) — turns the point-to-point polyline into the
// smooth, continuous curve modern analytics dashboards use, without needing a charting
// library. Falls back to a plain line for 0-1 points (nothing to curve) since the loop below
// assumes at least two.
function buildSmoothLinePath(coords) {
  if (coords.length < 2) return '';
  if (coords.length === 2) return `M${coords[0].x},${coords[0].y} L${coords[1].x},${coords[1].y}`;

  let path = `M${coords[0].x},${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const p0 = coords[i - 1] || coords[i];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return path;
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
  const baselineY = PAD_TOP + chartHeight;

  const xForIndex = (index) => PAD_LEFT + (points.length === 1 ? chartWidth / 2 : (index / (points.length - 1)) * chartWidth);
  const yForValue = (value) => PAD_TOP + chartHeight - ((value - minValue) / (maxValue - minValue || 1)) * chartHeight;
  const coords = points.map((point, index) => ({ x: xForIndex(index), y: yForValue(point.revenue) }));

  const linePath = buildSmoothLinePath(coords);
  const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${baselineY} L${coords[0].x.toFixed(1)},${baselineY} Z`;
  const yTicks = niceTicks(minValue, maxValue, 4);
  const hovered = hoverIndex != null ? points[hoverIndex] : null;

  // The one point called out permanently (like a "$400K +12%" bubble on a stats dashboard)
  // instead of only on hover — the highest month in the window, so the chart always leads
  // with its best number. Ties go to the earliest occurrence, same as Math.max/indexOf.
  const peakIndex = values.indexOf(maxValue);
  const peakPoint = points[peakIndex];
  const previousValue = peakIndex > 0 ? values[peakIndex - 1] : null;
  // Skip the percentage when the prior month was ₱0 — "+Infinity%" off a zero base isn't a
  // real, meaningful figure, so the callout just shows the value alone in that case.
  const peakChangePercent = previousValue ? Math.round(((maxValue - previousValue) / previousValue) * 100) : null;

  return (
    <div className="price-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Monthly revenue trend">
        <defs>
          <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--green-600)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--green-600)" stopOpacity="0" />
          </linearGradient>
        </defs>

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

        <motion.path
          d={areaPath}
          className="chart-area"
          fill={`url(#${GRADIENT_ID})`}
          stroke="none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        />
        {/* Classic SVG "draw the line" effect — framer-motion animates pathLength from 0 to
            1 by driving the underlying stroke-dasharray/-dashoffset itself, so the curve
            traces itself in on mount instead of just appearing. */}
        <motion.path
          d={linePath}
          className="chart-line"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: LINE_DRAW_DURATION_S, ease: 'easeInOut' }}
        />

        {points.map((point, index) => {
          const { x, y } = coords[index];
          // Staggered so each dot pops in roughly as the line reaches it, not all at once.
          const dotDelay = (index / Math.max(1, points.length - 1)) * LINE_DRAW_DURATION_S;
          return (
            <g key={point.label}>
              {hoverIndex === index ? (
                <line x1={x} x2={x} y1={PAD_TOP} y2={baselineY} className="chart-crosshair" />
              ) : null}
              <motion.circle
                cx={x}
                cy={y}
                r={index === peakIndex ? 5 : 4}
                className={`chart-dot ${index === peakIndex ? 'peak' : ''}`}
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: dotDelay }}
              />
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

      <motion.div
        className="chart-callout"
        style={{ left: `${(coords[peakIndex].x / WIDTH) * 100}%` }}
        initial={{ opacity: 0, y: 8, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 22, delay: LINE_DRAW_DURATION_S - 0.05 }}
      >
        <strong>{formatCurrency(peakPoint.revenue)}</strong>
        {peakChangePercent != null ? (
          <span className={`chart-callout-change ${peakChangePercent >= 0 ? 'up' : 'down'}`}>
            {peakChangePercent >= 0 ? '+' : ''}{peakChangePercent}%
          </span>
        ) : null}
      </motion.div>

      <AnimatePresence>
        {hovered && hoverIndex !== peakIndex ? (
          <motion.div
            key={hoverIndex}
            className="chart-tooltip"
            style={{ left: `${(coords[hoverIndex].x / WIDTH) * 100}%` }}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.15 }}
          >
            <strong>{formatCurrency(hovered.revenue)}</strong>
            <span>{hovered.label}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
