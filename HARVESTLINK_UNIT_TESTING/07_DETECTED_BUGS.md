# 07 - Detected Bugs

## 1 - Missing coordinate guard

- File: `src/utils/geo.js`
- Issue: `haversineKm` dereferenced coordinates before validating them.
- Fix: null and numeric coordinate validation now returns `null`.
- Status: Fixed.
- Verification: Dedicated live-tracking unit case passes.

## 2 - Stale frontend test expectations

- Files: account inactivity, admin reference, admin portal, landing header tests.
- Issue: Tests expected previous labels/signatures after implementation changes.
- Fix: Test expectations now match actual current UI and deactivation reason signatures.
- Status: Fixed.

## 3 - Dashboard test harness missing CatalogProvider hook mock

- File: `tests/dashboardDonationIsolation.test.mjs`
- Issue: Farmer dashboard now uses `useCatalog`, but the test harness did not provide it.
- Fix: Harness now supplies `useCatalog: () => ({ commodities: [] })`.
- Status: Fixed.

## 4 - Stale market recommendation test expectations

- File: `backend/tests/marketPriceRecommendation.test.js`
- Issue: Existing tests expected the old ±20% range and PSA null-band behavior.
- Fix: Tests now expect the dynamic ±5% competent range and evidence-based Market Insights result.
- Status: Fixed.

## 5 - Missing coordinate guard

- File: `src/utils/geo.js`
- Issue: distance calculation could receive null or invalid coordinates.
- Fix: coordinate validation and null return were added.
- Status: Fixed.

## 6 - Low coverage in external integrations

- Files: Gemini, Lalamove, road routing, weather, reCAPTCHA, and receipt email modules.
- These require integration/E2E testing or mocked HTTP/provider credentials.
- Status: Not a production bug.
