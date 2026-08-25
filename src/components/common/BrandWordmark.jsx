// "Harvest" green + "Link" navy — matches the two-tone wordmark in the reference logo
// (src/assets/logo.png's source artwork). Drop inside any existing <strong>/<span>/<h1> that
// currently just renders the literal string "HarvestLink" — this only supplies the two
// colored spans, not a wrapper, so it inherits whatever size/weight the caller already sets.
export default function BrandWordmark() {
  return (
    <>
      <span className="brand-wordmark-harvest">Harvest</span>
      <span className="brand-wordmark-link">Link</span>
    </>
  );
}
