# HarvestLink API

Express backend for HarvestLink, deployed independently on Render. Talks to Supabase
Postgres (via the service-role key) for accounts, products, orders, and notifications.
Auth itself (login/signup/session) is handled directly by the frontend against Supabase
Auth — this backend only verifies the resulting session token.

## Scope

Verified, active sessions have no general API request cap. Anonymous traffic
and invalid sessions remain limited to 30 requests per minute per IP.
Password reset, registration, payment, messaging, and other action-specific
limits remain in force. Session expiry and account access checks are unchanged.

The API includes shared donations alongside profiles, products, orders,
notifications, messaging, delivery, and other marketplace services. Donation
records must not use browser-only storage: farmers and stakeholder organizations
need the same server-side handoff state.

Before deploying donation changes, run
`supabase/migrations/20261009_shared_donations.sql` in the Supabase SQL Editor.
This is required for existing projects and fresh projects provisioned with
`supabase/schema.sql`. See `supabase/migrations/README.md` for rollout details.

## One-time setup

1. **Create a Supabase project** at supabase.com if you don't have one yet.
2. **Run `supabase/schema.sql`** (repo root) in the Supabase SQL editor — creates all
   tables, RLS, and the two Storage buckets in one pass. Safe to re-run.
3. **Turn off "Confirm email"**: Dashboard → Authentication → Providers → Email. This
   prototype logs a user in immediately at registration with no email step.
4. **Copy your keys**: Dashboard → Settings → API → Project URL, `anon` key,
   `service_role` key. You'll need all three across the backend and frontend env vars
   (see below).
5. **Seed the real admin account** (replaces the old hardcoded
   `admin@harvestlink.com` / `admin` plaintext login):
   ```bash
   cd backend
   npm install
   ADMIN_EMAIL=admin@harvestlink.com ADMIN_PASSWORD=<a-strong-password> npm run seed:admin
   ```
   (reads `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` from `backend/.env` — copy
   `.env.example` first and fill it in.)

## Local development

```bash
cd backend
cp .env.example .env   # fill in SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev             # http://localhost:4000, auto-restarts on file changes
```

The frontend expects `VITE_API_URL=http://localhost:4000/api` in the root `.env` for
local dev (see the root README for the full frontend env var list).

## Password recovery

`POST /api/auth/request-password-reset` checks both the application profile and
its verified Supabase Auth account before generating a recovery link. Missing
accounts receive a 404 response and no email. Email is sent through the existing
Resend configuration (`RESEND_API_KEY` and `RESEND_FROM_EMAIL`); missing provider
configuration or a rejected delivery returns an error instead of reporting success.

`APP_URL` is the canonical production frontend URL (defaults to
`https://harvestlink.dev`), and is automatically allowed by HTTP and socket CORS.
The live site's `https://www.harvestlink.dev` redirect destination is also allowed.
Production reset emails link directly to `https://harvestlink.dev/reset-password`
with a recovery token hash. The reset page verifies that token with Supabase,
without navigating through Supabase's potentially outdated Site URL. Local
development requests retain their localhost reset URL.

Also set Supabase Authentication's Site URL to `https://harvestlink.dev` and add
`https://harvestlink.dev/reset-password` and
`https://www.harvestlink.dev/reset-password` to its allowed redirect URLs for existing
Supabase-generated links. Previously sent expired or used links cannot be reused;
request a fresh email after deploying both the frontend and backend updates.

## Deploying to Render

Either use the included `render.yaml` (Render → New → Blueprint, point at this repo —
it reads `rootDir: backend` automatically) or configure manually:

- **Root directory**: `backend`
- **Build command**: `npm install`
- **Start command**: `npm start`
- **Environment variables**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `CORS_ALLOWED_ORIGIN` (your deployed Vercel URL), `NODE_ENV=production`

## Folder structure

```
backend/
  scripts/seedAdmin.js       one-off admin bootstrap
  src/
    server.js                entry point
    app.js                   express app, middleware, route mounting
    lib/
      supabaseClient.js      service-role supabase-js client
      ApiError.js            error-with-status-code helper
      serialize.js           snake_case DB rows -> camelCase API responses
      notify.js              internal createNotification() helper
      priceReview.js         ported DTI fair-pricing check (from productService.js)
      geo.js                 ported matchMunicipality()
      deliverySequence.js    ported delivery-step-sequence helpers
    middleware/
      requireAuth.js         verifies the Supabase session token
      requireRole.js         role-gate factory
      errorHandler.js        central error -> JSON responder
    routes/                  one file per resource, mounted under /api
    controllers/             one file per resource
    utils/constants.js       mirrors small enum lists from src/utils/constants.js
```
