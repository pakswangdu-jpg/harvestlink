


import './FarmersStatsRow.css';

function Stat({ value, label }) {
  return (
    <div className="farmers-stats-item">
      <span className="farmers-stats-value">{value}</span>
      <span className="farmers-stats-label">{label}</span>
    </div>
  );
}

export default function FarmersStatsRow({ farmerCount, averageRating, productCount, cityCount }) {
  return (
    <div className="farmers-stats-row">
      <Stat value={farmerCount} label="Verified Farmers" />
      <Stat value={averageRating ? averageRating.toFixed(1) : '—'} label="Average Rating" />
      <Stat value={productCount} label="Products Listed" />
      <Stat value={cityCount} label="Cities Covered" />
    </div>
  );
}
