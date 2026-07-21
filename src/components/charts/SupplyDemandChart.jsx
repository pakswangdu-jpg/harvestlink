const ROW_HEIGHT = 46;
const BAR_HEIGHT = 14;
const BAR_GAP = 4;
const LABEL_WIDTH = 110;
const PAD_RIGHT = 50;
const TOTAL_WIDTH = 560;

// Same "rounded only at the data end" reasoning as StatusBarChart.jsx's roundedBarPath.
function roundedBarPath(x, y, width, height, radius) {
  const r = Math.min(radius, width, height / 2);
  if (r <= 0) return `M${x},${y} h${width} v${height} h${-width} Z`;
  return `M${x},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height - r} Q${x + width},${y + height} ${x + width - r},${y + height} H${x} Z`;
}

// `data`: [{ key, label, supply, demand }] — real activeListings vs quantityOrdered per
// crop (see backend/src/controllers/forecast.controller.js). Both bars share one scale
// (the max of every supply/demand value) so the two are honestly comparable at a glance.
export default function SupplyDemandChart({ data }) {
  if (!data.length) {
    return (
      <div className="empty-state compact">
        <h3>No data yet</h3>
        <p>Nothing to report here yet.</p>
      </div>
    );
  }

  const maxValue = Math.max(...data.flatMap((entry) => [entry.supply, entry.demand])) || 1;
  const barAreaWidth = TOTAL_WIDTH - LABEL_WIDTH - PAD_RIGHT;
  const height = data.length * ROW_HEIGHT;

  return (
    <div className="supply-demand-chart-wrap">
      <div className="supply-demand-legend">
        <span><span className="legend-dot supply" /> Supply (active listings)</span>
        <span><span className="legend-dot demand" /> Demand (quantity ordered)</span>
      </div>
      <svg viewBox={`0 0 ${TOTAL_WIDTH} ${height}`} role="img" aria-label="Supply vs demand per crop" className="status-bar-chart">
        {data.map((entry, index) => {
          const rowY = index * ROW_HEIGHT;
          const supplyWidth = Math.max((entry.supply / maxValue) * barAreaWidth, entry.supply > 0 ? 3 : 0);
          const demandWidth = Math.max((entry.demand / maxValue) * barAreaWidth, entry.demand > 0 ? 3 : 0);
          const supplyY = rowY + (ROW_HEIGHT - (BAR_HEIGHT * 2 + BAR_GAP)) / 2;
          const demandY = supplyY + BAR_HEIGHT + BAR_GAP;
          return (
            <g key={entry.key}>
              <text x={LABEL_WIDTH - 10} y={rowY + ROW_HEIGHT / 2} textAnchor="end" dominantBaseline="middle" className="chart-axis-label">
                {entry.label}
              </text>
              {supplyWidth > 0 ? <path d={roundedBarPath(LABEL_WIDTH, supplyY, supplyWidth, BAR_HEIGHT, 4)} className="supply-demand-bar supply" /> : null}
              <text x={LABEL_WIDTH + supplyWidth + 8} y={supplyY + BAR_HEIGHT / 2} dominantBaseline="middle" className="chart-axis-label status-bar-value">
                {entry.supply}
              </text>
              {demandWidth > 0 ? <path d={roundedBarPath(LABEL_WIDTH, demandY, demandWidth, BAR_HEIGHT, 4)} className="supply-demand-bar demand" /> : null}
              <text x={LABEL_WIDTH + demandWidth + 8} y={demandY + BAR_HEIGHT / 2} dominantBaseline="middle" className="chart-axis-label status-bar-value">
                {entry.demand}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
