# HarvestLink API

Express backend for HarvestLink, deployed independently on Render. Talks to Supabase
Postgres (via the service-role key) for accounts, products, orders, and notifications.
Auth itself (login/signup/session) is handled directly by the frontend against Supabase
Auth — this backend only verifies the resulting session token.

## Scope

This backend currently covers **profiles (accounts), products, orders, and
notifications** only. Donations, messages, market prices, delivery routing, reports,
demand forecasting, geocoding, and translation are unchanged — they still run entirely
client-side against `localStorage` and free public APIs (see the root `src/services/`
folder). That's a deliberate, scoped first pass, not an oversight.

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
