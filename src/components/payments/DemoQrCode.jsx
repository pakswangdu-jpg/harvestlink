// A visually realistic but non-functional QR code — this is a demo payment module (see
// backend/src/controllers/payments.controller.js), so there is nothing real for it to
// encode or scan. The module grid is deterministic (seeded from `value`, e.g. the reference
// number) purely so the same order always renders the same-looking code rather than
// flickering to a new random pattern on every re-render.
function seededRandom(seed) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function hashSeed(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 1;
}

const GRID_SIZE = 21;
// Standard QR finder-pattern corners (top-left, top-right, bottom-left) — including these
// is what makes a random module grid actually read as "a QR code" at a glance.
const FINDER_SIZE = 7;

function isInFinderZone(row, col) {
  const zones = [
    [0, 0],
    [0, GRID_SIZE - FINDER_SIZE],
    [GRID_SIZE - FINDER_SIZE, 0],
  ];
  return zones.some(([zoneRow, zoneCol]) =>
    row >= zoneRow && row < zoneRow + FINDER_SIZE && col >= zoneCol && col < zoneCol + FINDER_SIZE
  );
}

function FinderPattern({ row, col }) {
  return (
    <>
      <rect x={col} y={row} width={FINDER_SIZE} height={FINDER_SIZE} fill="#0038a8" />
      <rect x={col + 1} y={row + 1} width={FINDER_SIZE - 2} height={FINDER_SIZE - 2} fill="#ffffff" />
      <rect x={col + 2} y={row + 2} width={FINDER_SIZE - 4} height={FINDER_SIZE - 4} fill="#0038a8" />
    </>
  );
}

export default function DemoQrCode({ value, size = 176 }) {
  const random = seededRandom(hashSeed(value || 'harvestlink'));
  const modules = [];
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      if (isInFinderZone(row, col)) continue;
      if (random() > 0.62) modules.push([row, col]);
    }
  }

  return (
    <svg
      viewBox={`0 0 ${GRID_SIZE} ${GRID_SIZE}`}
      width={size}
      height={size}
      role="img"
      aria-label="Demo GCash QR code"
      className="rounded-lg bg-white p-1"
    >
      <rect x="0" y="0" width={GRID_SIZE} height={GRID_SIZE} fill="#ffffff" />
      {modules.map(([row, col]) => (
        <rect key={`${row}-${col}`} x={col} y={row} width="1" height="1" fill="#0f172a" />
      ))}
      <FinderPattern row={0} col={0} />
      <FinderPattern row={0} col={GRID_SIZE - FINDER_SIZE} />
      <FinderPattern row={GRID_SIZE - FINDER_SIZE} col={0} />
    </svg>
  );
}
