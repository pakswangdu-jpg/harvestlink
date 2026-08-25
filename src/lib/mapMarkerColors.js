// Single source of truth for map pin/route colors — mirrors the token values used by
// .legend-dot.* in globals.css (--green-700/--blue-700/--amber-700/--violet-700/--rose-700).
// Pin icons are built as data:image/svg+xml strings (see buildPinIcon in DeliveryMap.jsx /
// FarmerMap.jsx), which can't reference CSS custom properties directly, so this keeps the
// two map components from independently hardcoding (and silently drifting from) the same
// five colors. Kept as plain hex, not var() lookups — Google Maps pins sit on the map's own
// tiles rather than the app's chrome, so they intentionally don't re-theme with dark mode the
// way the legend swatches do.
export const MAP_COLORS = {
  origin: '#15803d',
  destination: '#1d4ed8',
  farmer: '#b45309',
  buyer: '#7e22ce',
  stakeholder: '#db2777',
};
