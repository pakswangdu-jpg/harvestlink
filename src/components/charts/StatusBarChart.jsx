const BAR_HEIGHT = 20;
const ROW_HEIGHT = 36;
const LABEL_WIDTH = 130;
const PAD_RIGHT = 46;
const TOTAL_WIDTH = 480;

// Rounded only at the data-end (right side, away from the baseline) — a plain rect with
// a uniform border-radius would round the baseline corners too, which reads as if the
// bar starts mid-air instead of growing from a fixed zero point.
function roundedBarPath(x, y, width, height, radius) {
  const r = Math.min(radius, width, height / 2);
  if (r <= 0) return `M${x},${y} h${width} v${height} h${-width} Z`;
  return `M${x},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height - r} Q${x + width},${y + height} ${x + width - r},${y + height} H${x} Z`;
}

// `data`: [{ key, count }] — `labelFor`/`toneClassFor` resolve display text and a
// `.status-bar-*` tone class (good/warning/critical/neutral) per entry.
export default function StatusBarChart({ data, labelFor, toneClassFor }) {
  if (!data.length) {
    return (
      <div className="empty-state compact">
        <h3>No data yet</h3>
        <p>Nothing to report here yet.</p>
      </div>
    );
  }

  const maxCount = Math.max(...data.map((entry) => entry.count)) || 1;
  const barAreaWidth = TOTAL_WIDTH - LABEL_WIDTH - PAD_RIGHT;
  const height = data.length * ROW_HEIGHT;

  return (
    <svg viewBox={`0 0 ${TOTAL_WIDTH} ${height}`} role="img" aria-label="Status breakdown" className="status-bar-chart">
      {data.map((entry, index) => {
        const barWidth = Math.max((entry.count / maxCount) * barAreaWidth, 3);
        const y = index * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2;
        return (
          <g key={entry.key}>
            <text x={LABEL_WIDTH - 10} y={y + BAR_HEIGHT / 2} textAnchor="end" dominantBaseline="middle" className="chart-axis-label">
              {labelFor(entry)}
            </text>
            <path d={roundedBarPath(LABEL_WIDTH, y, barWidth, BAR_HEIGHT, 4)} className={toneClassFor(entry)} />
            <text
              x={LABEL_WIDTH + barWidth + 10}
              y={y + BAR_HEIGHT / 2}
              dominantBaseline="middle"
              className="chart-axis-label status-bar-value"
            >
              {entry.count}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
