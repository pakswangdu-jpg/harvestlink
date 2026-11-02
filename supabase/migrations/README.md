# Registered profile coordinates

## Admin profile-location reminders

Run `20261103_profile_location_reminders.sql` against the Supabase project used
by the backend before enabling the Admin location-reminder action. It adds the
`profile` notification type to the existing notification constraint without
changing existing notifications. The migration is safe to rerun. Fresh
installations receive the same type from `supabase/schema.sql`.

## Admin user locations map

Run `20261102_admin_profile_location_access.sql` after the base schema. It adds
an RLS-protected Admin-only read path for registered profiles. The Admin map API
also requires authenticated Admin authorization and returns only the location,
identity, account-status, and verification fields it needs, in pages of 500.
Authenticated profile reads are column-limited to that same safe subset; contact
numbers, identity documents, payment details, and credentials remain unavailable
through direct profile reads. Existing profile coordinates are not changed.

## Optional order-review photos

Run `20261031_order_review_photos.sql` after the base schema. It adds the nullable
`ratings.review_image_url` field and a public `review-images` bucket for optional
JPG, PNG, or WebP photos (maximum 5 MB) on completed-order reviews. Authenticated
users can upload and remove only files under their own user-ID folder; the
backend accepts a photo URL only when it belongs to that reviewer and order.
Photos are public because they appear with public farmer reviews. Deploy the
frontend and backend with this migration; no existing ratings are changed.

Run `20261102_order_review_videos.sql` after the review-photo migration. It adds
the nullable `ratings.review_video_url` field and a public `review-videos` bucket
for optional MP4 or WebM videos (maximum 20 MB) on completed-order reviews. The
feedback form accepts up to five photos or one video per review; videos must be 30
seconds or shorter. The frontend checks duration, storage enforces size and MIME
type, and the backend scopes accepted URLs to the reviewer and order. Videos are
public because they appear with public farmer reviews.

Run `20261103_product_specific_ratings.sql` to add the product snapshot to each
review and backfill existing order-based reviews from their order's product.
New order reviews are linked to the ordered product, and stakeholder donation
reviews include the donated product. Product detail pages use this link to show
only reviews for that product. Historical donation reviews without an order
cannot be assigned to a specific product and remain farmer-level only.

Run `20261104_multiple_order_review_photos.sql` after the order-review photo
migration. It adds a photo-array field while preserving and migrating existing
single-photo reviews. Reviewers can attach several photos to an order review;
the form does not display a count limit and only shows a message if the allowed
number of photos is exceeded.

Run `20261102_product_image_gallery.sql` after the base schema. It adds
`products.image_urls`, migrates existing cover photos into the gallery, and
supports up to 10 photos per product listing. Each photo is limited to 5 MB.

## Six-Month Inactivity Suspension

Apply `20261019_inactive_account_suspension.sql` after the base schema and
`20261010_admin_account_history.sql`, then deploy frontend and backend together.
The migration itself does not suspend existing users. The API's first scheduled
sweep after deployment will suspend already-overdue accounts, so review account
activity before rollout. Do not rerun the provisioning schema on a live project.

The policy covers Buyer, Farmer and Stakeholder accounts, never Admin accounts.
Six calendar months are measured in Asia/Manila from the latest recorded activity,
registration date, or recorded Admin reactivation. Never-active users use their
registration date. Reactivation leaves the actual last-active timestamp untouched
and grants another six months. Future activity timestamps are not treated as overdue.

The sweep is a service-role-only transaction, with a maximum of 500 accounts per
batch. It changes only the account status and suspension timestamp, records a
`USER_AUTO_SUSPENDED` history event with System as actor, and notifies the user and
active Admins using the existing notification system. History/notification failure
rolls back the suspension. Orders, verification, payments and profile identity
are preserved. Already-suspended accounts are not processed again.

The backend checks on startup and hourly, processes bounded batches, and blocks
an overdue account on authenticated HTTP or socket access before activity can be
refreshed. Existing Admin Reactivate account restores access. Browser profile
writes cannot forge the inactivity timestamp, registration date, role or account
status; ordinary profile field editing through the existing API is unchanged.

For scheduling independent of an API host that sleeps, enable Supabase Cron
(`pg_cron`) in the project's Dashboard, then rerun this migration. When the
extension is enabled it registers the named hourly job
`harvestlink-six-month-inactivity`. The API worker remains a safe fallback;
transaction locking and the active-status check prevent duplicate suspensions.
Without Cron, unattended checks run only while the backend is running, with an
immediate catch-up on startup and exact eligibility checks on attempted access.
See [Supabase Cron](https://supabase.com/docs/guides/cron) for enabling and monitoring jobs.

No live project migration or account suspension is performed by local tests.

## Manual Lalamove Delivery

Before deploying the updated courier flow, run `20261017_manual_lalamove.sql`
in the backend project's Supabase SQL Editor, after `supabase/schema.sql` and
the existing required migrations. This also applies to new installations.
Deploy frontend and backend together. The application does not run migrations
at startup; courier writes fail closed when the function is missing.

The migration adds nullable courier vehicle-plate and handover-time fields and a service-role-only
transaction function. Booking leaves the order Packed. Only the owning active
Farmer's physical-handover confirmation sets Out for delivery and the existing
`orders.transit_started_at` timestamp. `deliveries.handed_over_at` records this
physical handover without relabeling historical booking timestamps as handovers.
`deliveries.created_at` is the booking
timestamp. Existing Buyer receipt confirmation still completes the transaction;
a trigger synchronizes the manual courier record in that same transaction.
No existing records, prices, fees, payments, or coordinates are rewritten.

Farmers book externally and paste an official HTTPS `lalamove.com` share link.
The saved link is opened unchanged, not reconstructed from a booking number.
There is no automatic booking or HarvestLink courier GPS/map in this flow.
Historical API fields remain intact. The existing courier checkout quotation
and pricing path is intentionally unchanged and still needs its existing API
configuration; supporting new courier checkout without that API is separate work.

## Marketplace order integrity

Before deploying the new checkout/backend, run `20261010_order_integrity.sql`
against the backend's Supabase project. For new installations, run it after
`supabase/schema.sql` and the existing required migrations. It is rerunnable.

This adds buyer-scoped checkout request keys, cancellation/rejection reasons,
and a service-role-only order transition function. The function locks the order
and product together: farmer confirmation deducts stock once, and eligible buyer
cancellation restores it once. An event-history failure rolls back both writes.
The later `20261030_inventory_messaging_donations.sql` migration supersedes the
confirmation-time stock rule: checkout now locks the product and reserves the
requested quantity atomically, while rejection/cancellation releases it and
buyer completion moves it to sold. Existing confirmed/completed orders are
backfilled into the ledger before the new transition functions are used.

Checkout uses `/orders/quote` for its current server-computed total. Submission
includes that reviewed total and a stable request key. A changed price/fee is a
conflict, not a silently changed charge; retrying an identical successful request
returns its original order. Existing callers without a request key remain
compatible but do not receive the new retry guarantee.

If checkout reports `column orders.checkout_key does not exist`, this migration
has not been applied to the Supabase project configured by the backend. Run the
complete SQL file in that project's SQL Editor, then retry checkout.

Deploy the frontend and backend together after the migration. Without it, stock
decisions intentionally fail closed rather than falling back to unsafe writes.
No live database migration is performed by the application at startup.

## Inventory reservations, product messaging, and expiring donation claims

Run `20261030_inventory_messaging_donations.sql` after the base schema and the
existing order-integrity and shared-donations migrations. Deploy the backend and
frontend together. The migration is rerunnable and intentionally fails closed
when its service-role functions are not installed.
Run `20261103_product_inventory_realtime.sql` after it to publish stock-only
inventory events through Supabase Realtime. Authenticated clients can read
public-listing stock events; farmers can also read events for their own listings.
Product details continue to be loaded through the backend.

Marketplace checkout uses a service-role transaction that locks the product,
validates the server-computed price and quantity, decrements available stock,
increments `reserved_quantity`, and records `stock_state = 'reserved'` before
the order is visible. Rejection and eligible cancellation restore stock exactly
once; buyer completion moves the reservation to `sold_quantity`. The product is
never allowed to go negative, and the checkout key remains idempotent.

Direct product conversations validate that the selected product belongs to the
farmer being contacted and snapshot a small product context on the message.
The existing authenticated message permissions remain in force.

Donation offers now require a future Asia/Manila expiration date and time. The
database stores the timestamp, exposes a service-role `expire_donations()` job,
and optionally registers a Supabase Cron job when `pg_cron` is enabled. Claims
are quantity-specific and locked in `donation_claims`; duplicate active claims,
overclaims, negative quantities, and post-expiration claims are rejected.
Farmer rejection and stakeholder cancellation release claimed quantity exactly
once, while completed claim history is retained.

Farmer withdrawal restores only the still-unclaimed quantity for a new offer and
refuses to withdraw while an active claim is pending or scheduled. Stakeholder
receipt and rating state is tracked per claim, so multiple organizations can use
one donation offer without overwriting one another's history.

The API still exposes the older donation transition endpoints for historical
records. New donation offers and quantity claims use the new transaction
functions. No live database migration is performed by the application at
startup.

## Unified product and donation messaging

Run `20261101_unified_listing_messaging.sql` after `20261030_inventory_messaging_donations.sql`
and `20261031_traceability_context.sql`, then deploy the backend and frontend together.
The migration backfills one persistent direct conversation per participant pair,
snapshots donation descriptions and listing context on messages, and enables
participant-only message reads for Supabase Realtime. Message writes remain
service-role-only through the authenticated backend.

Product inquiries are revalidated against the listing owner, active status, and
available stock. Donation inquiries are limited to verified stakeholders viewing
available, unexpired offers; buyers do not receive donation access or claim
permissions. Donation claim creation and status transitions write contextual
system messages in the same database transaction as the real claim event.

The existing pair-based direct message URLs continue to work. A pair has one
conversation across multiple product, donation, and order contexts. Historical
messages are backfilled where both participants can be resolved. Expired or
removed listings do not delete stored conversation snapshots.

## Shared donations

Run `20261009_shared_donations.sql` in the Supabase SQL Editor for the project
configured by the backend's `SUPABASE_URL`, then deploy the updated backend
and frontend together. For a fresh project, run it after `supabase/schema.sql`.

This creates shared donation records and service-role-only transaction functions.
Listing reserves real product stock; cancellation restores it once. Requests
require an active, verified stakeholder. Only the donating farmer can accept,
decline, or cancel, and only the requesting organization can confirm receipt.
Notifications are committed with each handoff. The migration is rerunnable.

Old browser-only donations are not imported: localStorage is untrusted and
cannot prove ownership or stock availability. Farmers must relist those offers
after the migration. No accounts are automatically verified by this migration.

## Registration fails because `public.farmers` does not exist

Run `20261009_remove_legacy_profile_sync.sql` in the Supabase SQL Editor for
the project configured by the backend's `SUPABASE_URL`, then retry email
verification. Request a fresh code if the current one has expired.

This repair removes only the obsolete profile-to-role-table synchronization
triggers, including renamed triggers attached to `public.sync_profile_role_table`.
It leaves account data, unrelated triggers, and RLS policies intact, and can be
rerun. It does not recreate the removed `farmers`, `buyers`, or `stakeholders`
tables. The current backend already stores all account fields in `profiles`.

If the error remains, inspect the installed trigger functions before changing
other database objects:

```sql
select table_schema.nspname as table_schema,
       table_row.relname as table_name,
       trigger_row.tgname as trigger_name,
       function_schema.nspname as function_schema,
       function_row.proname as function_name,
       pg_get_functiondef(function_row.oid) as function_definition
from pg_trigger trigger_row
join pg_class table_row on table_row.oid = trigger_row.tgrelid
join pg_namespace table_schema on table_schema.oid = table_row.relnamespace
join pg_proc function_row on function_row.oid = trigger_row.tgfoid
join pg_namespace function_schema on function_schema.oid = function_row.pronamespace
where not trigger_row.tgisinternal
  and trigger_row.tgrelid in ('public.profiles'::regclass, 'auth.users'::regclass);
```

## Optional wholesale pricing

Run `20261005_product_wholesale_pricing.sql` before deploying the dual-price API
to an existing project. New installations use `supabase/schema.sql`.
The migration adds nullable wholesale price/minimum columns and validates that
enabled tiers have a positive price below retail and a positive minimum. Existing
retail prices and wholesale-only listing prices/MOQs are unchanged.

The saved wholesale price applies to every unit in an order when its quantity
reaches the saved minimum. Retail discounts must leave the retail price above
the wholesale price. Stock may fall below the minimum after sales without
removing the tier; new or changed minimums must fit available stock.
The shared calculation lives in `backend/shared/pricing.js` so it is included
in the backend's standalone Render deployment and imported by the frontend.

## Consolidating user profiles

`public.profiles` is the canonical account table. All application account
relationships reference `profiles.id`; the `farmers`, `buyers`, and
`stakeholders` tables in older databases are role extensions, not account
tables.

For an existing project, run these migrations in order against the same
Supabase project used by the deployed backend (`SUPABASE_URL`):

1. `20261002_profiles_role_data.sql` safely fills missing farmer and stakeholder
   profile fields, checks authenticated-user/profile coverage, and disables the
   profile-to-role-table synchronization trigger. It preserves conflicting
   profile values and applies own-profile RLS for authenticated clients.
2. Deploy the application version that uses `profiles` as the source for all
   user/account reads and writes. The repository has no direct frontend or
   backend queries to the three role extension tables.
3. Review and resolve any data conflict or dependency reported by
   `20261003_drop_role_profile_tables.sql`, then run that migration to remove
   the obsolete extension tables. It uses `RESTRICT` and aborts if it finds
   external foreign keys or profile/data inconsistencies; it never cascades.

For new installations, use `supabase/schema.sql`, which creates the canonical
profile schema without the old role extension tables. Do not run the drop
migration until the consolidation migration has completed and the updated app
has been deployed and verified.

## Registered coordinates

Before deploying profile-location changes to an existing database, run
`20261002_profile_coordinates.sql` against the same Supabase project. New
installations can use the updated `supabase/schema.sql`.

The migration adds nullable, range-checked latitude/longitude pairs. It does not
guess or backfill existing account locations from municipality centers. Existing
users can select their address from suggestions under **Profile → Edit profile**.
New registrations preserve the selected place through email verification and
store its coordinates directly on the newly created `profiles` row.

The migration notifies PostgREST to reload its schema cache after creating the
columns. Confirm the migration ran in the correct project before deploying the
backend; the profile update API writes to the database configured by its
`SUPABASE_URL`.

Nearby pages use the authenticated profile's saved coordinates, without requesting
device location. Distances are straight-line distances; accounts without valid
saved coordinates have no claimed distance. Distant markers remain on the map,
but initial framing includes the user and up to eight farmers within 25 km so
remote directory entries do not force an unusably wide view.

## Admin Account History

Apply `20261010_admin_account_history.sql` before deploying the updated Admin Users flow. It adds rejection reasons and an append-only account action history, and makes status changes and audit writes atomic. Existing verification/account endpoints remain in use; they fail closed if the migration is missing. No accounts or transaction records are deleted. Existing historical actions are not backfilled or invented. `suspended` remains the stored value for the UI label Deactivated.

If the migration has not been applied, User details remains read-only: profile,
documents, and activity counts are available, but history is explicitly marked
unavailable and account-change controls are disabled. This is not a substitute
for applying the migration. Run the complete SQL file in the connected project's
Supabase SQL Editor, then reopen User details. The migration reloads the schema
cache; it does not create accounts or alter existing account statuses.

## Final Transaction Receipts

Apply `20261020_final_transaction_receipts.sql` after the base schema, before
deploying final receipt emails. It adds nullable `orders.completed_at` and the
private, service-only `order_receipt_emails` queue. Existing account, payment,
delivery and order states are unchanged. Historical completions are neither
backfilled with invented dates nor automatically emailed. The migration is
rerunnable. See `backend/README.md` for worker setup and safe retry handling.

## Admin Market Price Notifications

Apply `20261010_market_price_notifications.sql` after the base schema. It adds
the `market_price` notification type and an override trigger. Setting/changing a
reference price sends an in-app notification to every active buyer, farmer, and
stakeholder in the same transaction. Saving the same price/year again does not
duplicate notifications. A failed notification insert rolls back the override.
Existing overrides are not backfilled. Product selling prices are never changed.

## Product-to-order traceability

Apply `20261031_traceability_context.sql` after the inventory and messaging
migration. It preserves the original product identifier on orders, stores the
listing details on direct product inquiries, and links the latest matching
inquiry to the order created by that buyer or stakeholder. Snapshot identifiers
are intentionally retained if a live listing is later removed. The association
is private to the existing conversation and order parties; it does not broaden
message or order access.
The migration is rerunnable and must be applied for automatic notifications;
marketplace reference labels use the existing overrides API independently.
