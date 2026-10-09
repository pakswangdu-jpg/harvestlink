# Registered profile coordinates

## Marketplace order integrity

Before deploying the new checkout/backend, run `20261010_order_integrity.sql`
against the backend's Supabase project. For new installations, run it after
`supabase/schema.sql` and the existing required migrations. It is rerunnable.

This adds buyer-scoped checkout request keys, cancellation/rejection reasons,
and a service-role-only order transition function. The function locks the order
and product together: farmer confirmation deducts stock once, and eligible buyer
cancellation restores it once. An event-history failure rolls back both writes.
Stock is still deducted on farmer confirmation, not when a buyer places a
pending order. This preserves the existing reservation business rule.

Checkout uses `/orders/quote` for its current server-computed total. Submission
includes that reviewed total and a stable request key. A changed price/fee is a
conflict, not a silently changed charge; retrying an identical successful request
returns its original order. Existing callers without a request key remain
compatible but do not receive the new retry guarantee.

Deploy the frontend and backend together after the migration. Without it, stock
decisions intentionally fail closed rather than falling back to unsafe writes.
No live database migration is performed by the application at startup.

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

## Admin Market Price Notifications

Apply `20261010_market_price_notifications.sql` after the base schema. It adds
the `market_price` notification type and an override trigger. Setting/changing a
reference price sends an in-app notification to every active buyer, farmer, and
stakeholder in the same transaction. Saving the same price/year again does not
duplicate notifications. A failed notification insert rolls back the override.
Existing overrides are not backfilled. Product selling prices are never changed.
The migration is rerunnable and must be applied for automatic notifications;
marketplace reference labels use the existing overrides API independently.
