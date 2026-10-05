# Registered profile coordinates

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
