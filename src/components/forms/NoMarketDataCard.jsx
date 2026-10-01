





export default function NoMarketDataCard() {
  return (
    <div className="price-analysis-card">
      <p className="price-analysis-card-title">No Market Analysis Available</p>
      <p className="price-analysis-card-desc">
        This product is not currently included in the PSA database and there are no historical market prices
        available. Because there is insufficient market data, HarvestLink cannot generate an AI-powered selling price
        recommendation.
      </p>
      <div className="price-analysis-status-row">
        <span className="price-analysis-status-item">
          PSA Reference <span className="badge badge-unavailable">Unavailable</span>
        </span>
        <span className="price-analysis-status-item">
          Historical Prices <span className="badge badge-unavailable">Unavailable</span>
        </span>
      </div>
      <p className="price-analysis-prompt">Enter your Cost per Unit to generate a Cost-Based Estimate.</p>
    </div>
  );
}
