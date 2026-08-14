// Shown once ProductForm.jsx has confirmed BOTH PSA and historical-transaction data have
// nothing for this product (see PriceAnalysisPanel.jsx's tier cascade) and the farmer hasn't
// entered a cost yet — the honest "we genuinely have nothing" state. Deliberately shows no
// price, profit, markup, "Use this price" button, or confidence score of any kind — a
// production-grade market recommendation must never be fabricated from nothing just to
// avoid an empty state.
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
