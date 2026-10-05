# Tracking recovery and project review

Reviewed: 2026-10-05

## Recovery status

The user confirmed the recovery target is the version immediately before the
latest attempted route fix, including Copilot's existing uncommitted tracking
work. That behavior is restored. This is not a reset to the latest Git commit.

The attempted shared routing endpoint, backend route service, shared tracking
module, and frontend route hook have been removed. The existing Google routing
calls, tracking views, GPS sharing, and route fallback behavior remain in place.
The earlier dual-price changes are preserved.

The restored production build produced the same main JavaScript asset name as
the build before the attempted route fix: `index-nBkhqJC4.js`.

## Review coverage and validation

- Repository-wide static scan of 352 source, configuration, schema, test, and
  documentation files, excluding secrets/environment files, dependency lockfiles,
  generated output, dependencies, and binary assets.
- Coverage includes 254 files in `src`, 77 in `backend`, 7 in `supabase`,
  7 in `tests`, and 7 root configuration/documentation files.
- No unresolved relative imports or merge-conflict markers found.
- Detailed inspection of tracking, order/inventory transitions, profile access,
  payment handlers, donation persistence, pricing, deployment configuration,
  schema policies, and their related UI flows.
- Frontend tests: 46 passed. Backend tests: 24 passed.
- Frontend and backend ESLint checks passed.
- Restored production build passed; the existing large JavaScript chunk warning
  remains. `git diff --check` passed.

This is a repository review plus automated validation, not a claim that every
screen, external service, device GPS flow, or live database policy was tested.
The findings below were not changed as part of this recovery/review.

## Findings

### High: profile policies do not protect privileged columns

`supabase/schema.sql:786` and `supabase/schema.sql:791` allow authenticated
users to insert/update their own profile row, checking the row ID only. The
profile contains `role`, `account_status`, and `verification_status`; the role
constraint permits `admin`. No column restrictions or protected-field trigger
appear in the checked-in schema/migrations.

If the deployed database grants authenticated users table-wide insert/update
privileges, those policies permit changes to privileged fields through direct
database requests. The backend trusts the saved profile role. Verify live
grants and protect those fields at the database boundary; frontend/backend
form restrictions alone do not cover direct Supabase access. Live grants were
not inspected, so exploitability in the deployed database is unverified.

### High: any authenticated user can retrieve another user's full profile

`backend/src/controllers/profiles.controller.js:211` fetches a requested profile
with the service role and returns `serializeProfile` without an ownership,
relationship, or admin check. `backend/src/routes/profiles.routes.js` requires
authentication only for this endpoint. The serializer includes email, birthday,
contact details, precise coordinates, document paths, and GCash details.

Use a restricted public/relationship-specific response and reserve sensitive
fields for the account owner and authorized admins. Document paths are exposed;
this review does not establish access to the private document contents.

### High: concurrent order confirmations can oversell inventory

`backend/src/controllers/orders.controller.js:217` reads a pending order,
decrements stock, then updates the order separately.
`backend/src/controllers/products.controller.js:484` reads quantity and writes
an absolute replacement without an atomic conditional decrement or transaction.

Two confirmations can read the same stock and overwrite each other's reduction.
A failure between the stock and order updates can also leave them inconsistent.
Move the stock check, decrement, and order transition into one database
transaction with concurrency protection. Cancellation/restocking needs the same
review for retries and concurrent requests.

### High: donation creation does not remove API-backed marketplace inventory

`src/features/farmer/FarmerProducts.jsx` creates/loads products through the API,
then calls `createDonation`. `src/services/donationService.js:58` deactivates
the product using `local/productServiceLocal`, not the API product service.

The donation and notifications stay in browser local storage, and the server
listing can remain active with its original quantity. Other devices/users do
not receive a shared donation record. Donation creation and stock changes need
shared backend persistence and one coordinated operation.

### Medium: the restored tracking views use different route calculations

`src/components/orders/LiveDeliveryMap.jsx` requests a navigation route from the
current GPS position during delivery, with a legacy Google Directions fallback.
`src/components/orders/LiveTrackingModal.jsx:296` requests a route from the saved
farm location to the saved buyer location. Different start points and request
timing can produce different routes even for the same order.

Both views substitute a direct line between endpoints when no road route is
available (`LiveDeliveryMap.jsx:449`, `LiveTrackingModal.jsx:321`). That explains
the straight line in the supplied screenshot; it is not evidence of a road
route. This fallback was deliberately retained to recover the requested version.

### Medium: tracking speed and distance can mislead

`src/components/orders/LiveTrackingModal.jsx:200` labels raw geolocation speed
as km/h without the m/s-to-km/h conversion used in `LiveDeliveryMap`. A GPS
speed of 10 m/s would appear as 10 km/h instead of 36 km/h.

The modal and `src/services/orderService.js` use straight-line remaining distance
for some ETA calculations. These values can underestimate a road journey.
`backend/src/realtime/orderTracking.js:171` also uses municipality coordinates
(with an artificial offset for same-municipality orders) for arrival notices,
rather than the saved buyer coordinates used by the maps.

### Medium: socket location state can outlive its order or newer data

`src/hooks/useOrderTrackingSocket.js` preserves `livePosition` when `orderId`
changes and does not compare update timestamps. Reusing the hook for another
order can temporarily show the previous order's location; delayed updates can
replace newer ones. The anonymous `connect_error` listener is also not removed
in cleanup, so repeated mounts can accumulate listeners.

### Medium: expired products are not checked when creating orders

`backend/src/controllers/products.controller.js` hides expired listings and
rejects buyer/stakeholder detail requests for them. However,
`backend/src/controllers/orders.controller.js:createOrder` checks active status,
stock, and price review without checking expiration. A listing opened before
expiry, or an API request using its ID, can still submit an order after expiry
while the product remains active. Enforce expiry at order creation as well.

### Deployment/configuration follow-up

- The dual-price migration
  `supabase/migrations/20261005_product_wholesale_pricing.sql` is prepared but
  has not been applied to a live database in this session.
- `backend/src/lib/security.js` requires a 32-byte
  `PENDING_REGISTRATION_SECRET` in production, but `render.yaml` does not declare
  it. A fresh deployment using only that blueprint's variables will fail startup;
  an existing service may already have it configured manually.
- Root/backend READMEs describe messages and several other features as entirely
  client-side, while API-backed implementations exist. Refresh the architecture
  documentation before using it as a deployment or migration guide.

## Suggested order of future fixes

1. Verify/protect profile database permissions and restrict profile responses.
2. Make inventory/order transitions atomic and persist donations on the backend.
3. Address tracking route consistency, fallback presentation, GPS state, and units
   in a separate change while retaining a snapshot of this recovered version.
4. Align deployment variables, migrations, documentation, and end-to-end tests.
