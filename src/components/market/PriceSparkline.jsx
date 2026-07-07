const WIDTH = 132;
const HEIGHT = 40;
const PADDING = 4;

export default function PriceSparkline({ points }) {
  const valid = points.filter((point) => point.price != null);
  if (valid.length < 2) {
    return <div className="sparkline sparkline-empty">Not enough data yet</div>;
  }

  const prices = valid.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const stepX = (WIDTH - PADDING * 2) / (valid.length - 1);
  const coords = valid.map((point, index) => ({
    x: PADDING + index * stepX,
    y: HEIGHT - PADDING - ((point.price - min) / range) * (HEIGHT - PADDING * 2),
  }));

  const path = coords.map((coord, index) => `${index === 0 ? 'M' : 'L'}${coord.x.toFixed(1)},${coord.y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];

  return (
    <svg className="sparkline" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Recent price trend">
      <path d={path} className="sparkline-line" fill="none" />
      <circle cx={last.x} cy={last.y} r="4" className="sparkline-dot" />
    </svg>
  );
}
