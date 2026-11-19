# 06 - Code Coverage Report

## Dedicated Vitest Coverage

The dedicated V8 coverage run reported:

- Statements: 10.06%
- Branches: 8.38%
- Functions: 11.22%
- Lines: 10.79%

Coverage report locations:

- Text: terminal output
- JSON summary: `HARVESTLINK_UNIT_TESTING/coverage/coverage-summary.json`
- HTML: `HARVESTLINK_UNIT_TESTING/coverage/index.html`

## Coverage Interpretation

The 10.79% is the verified line coverage for the dedicated Vitest slice, not total repository or capstone coverage. It increased after adding utilities for notification sound, profile drafts, locations, units, vehicles, validators, delivery, pricing, forecasting, donations, and payments. Overall 80% repository coverage is not verified and is not claimed.

Features without adequate Vitest direct coverage include:

- React component rendering
- Socket.io realtime behavior
- External Google Maps UI behavior
- Real Supabase database writes
- Real Resend delivery
- Real GCash/Lalamove payment calls

These are covered primarily by mocks/PGlite or require integration/E2E testing.
