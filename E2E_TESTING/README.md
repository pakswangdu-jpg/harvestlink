# HarvestLink Functional E2E Test Pack

These files separate the manual functional checks by role and feature. Execute each action in the running application and record the result beside the step.

## Prerequisites

- Run the frontend and backend in a non-production environment.
- Use isolated test accounts for Admin, Farmer, Buyer, and Stakeholder.
- Do not use production records or real payment credentials.
- Record screenshots for failed steps.

## Test files

- `01-authentication.md` — registration, login, logout, recovery, protected routes
- `02-farmer-product-buttons.md` — product creation, editing, photos, pricing, deletion
- `03-farmer-orders-donations.md` — order actions, delivery, donations, messaging
- `04-buyer-marketplace-checkout.md` — browsing, filters, details, cart, checkout
- `05-buyer-orders-reviews.md` — order tracking, cancellation, review submission
- `06-stakeholder-donations.md` — donation browsing, requests, pickup, reviews
- `07-admin-controls.md` — user, product, market-price, and permission controls
- `08-responsive-accessibility.md` — mobile, tablet, desktop, themes, keyboard checks

Each file uses the same result values: `PASS`, `FAIL`, or `BLOCKED`.
