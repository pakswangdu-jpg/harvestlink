import { motion } from 'framer-motion';

const BAR_WIDTH = 44;
const GAP = 28;
const CHART_HEIGHT = 150;
const VALUE_ROW_HEIGHT = 26;
const LABEL_ROW_HEIGHT = 30;
const TOTAL_HEIGHT = VALUE_ROW_HEIGHT + CHART_HEIGHT + LABEL_ROW_HEIGHT;
// The viewBox's aspect ratio is what the "width: 100%; height: auto" CSS scales by — with
// too few bars, the viewBox goes narrow-and-tall, and stretching that to the panel's full
// width blows the height up into one giant bar filling the card. Flooring the width
// calculation at this many slots keeps the aspect ratio sane even for a single data point,
// same as StatusBarChart.jsx never needs since its row count grows the *height* instead.
const MIN_SLOTS = 4;

// Rounded only at the top (data end) — a plain rect with a uniform border-radius would
// round the baseline corners too, which reads as if the bar starts mid-air instead of
// growing from a fixed zero point. Mirrors StatusBarChart.jsx's roundedBarPath, just
// rounding the opposite edge since bars grow upward here instead of rightward.
function roundedColumnPath(x, y, width, height) {
  const radius = Math.min(8, width / 2, height);
  if (radius <= 0) return `M${x},${y} h${width} v${height} h${-width} Z`;
  return `M${x},${y + radius} Q${x},${y} ${x + radius},${y} H${x + width - radius} Q${x + width},${y} ${x + width},${y + radius} V${y + height} H${x} Z`;
}

// A vertical-column counterpart to StatusBarChart.jsx — same `data`/`labelFor`/
// `toneClassFor` shape, so either can be dropped in depending on which reads better for a
// given breakdown (this one for a handful of short, single-word categories like a status or
// role; StatusBarChart for longer or more numerous labels, where horizontal bars keep the
// text legible instead of cramming it under a narrow column).
export default function VerticalBarChart({ data, labelFor, toneClassFor }) {
  if (!data.length) {
    return (
      <div className="empty-state compact">
        <h3>No data yet</h3>
        <p>Nothing to report here yet.</p>
      </div>
    );
  }

  const maxCount = Math.max(...data.map((entry) => entry.count)) || 1;
  const contentWidth = data.length * (BAR_WIDTH + GAP) + GAP;
  const totalWidth = Math.max(data.length, MIN_SLOTS) * (BAR_WIDTH + GAP) + GAP;
  // Centers the actual bars within the (possibly wider) floored canvas, rather than leaving
  // a lone bar stranded at the left edge of all that extra breathing room.
  const offsetX = (totalWidth - contentWidth) / 2;
  const baselineY = VALUE_ROW_HEIGHT + CHART_HEIGHT;

  return (
    <svg viewBox={`0 0 ${totalWidth} ${TOTAL_HEIGHT}`} role="img" aria-label="Status breakdown" className="vertical-bar-chart">
      <g transform={`translate(${offsetX}, 0)`}>
        {data.map((entry, index) => {
          const barHeight = entry.count > 0 ? Math.max((entry.count / maxCount) * CHART_HEIGHT, 6) : 0;
          const x = GAP + index * (BAR_WIDTH + GAP);
          const y = baselineY - barHeight;
          return (
            <g key={entry.key}>
              <text x={x + BAR_WIDTH / 2} y={VALUE_ROW_HEIGHT - 8} textAnchor="middle" className="chart-axis-label vertical-bar-value">
                {entry.count}
              </text>
              {barHeight > 0 ? (
                <motion.path
                  d={roundedColumnPath(x, y, BAR_WIDTH, barHeight)}
                  className={toneClassFor(entry)}
                  style={{ transformBox: 'fill-box', transformOrigin: 'bottom' }}
                  initial={{ scaleY: 0, opacity: 0 }}
                  animate={{ scaleY: 1, opacity: 1 }}
                  transition={{ duration: 0.55, delay: index * 0.08, ease: 'easeOut' }}
                />
              ) : null}
              <text x={x + BAR_WIDTH / 2} y={baselineY + 20} textAnchor="middle" className="chart-axis-label">
                {labelFor(entry)}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
