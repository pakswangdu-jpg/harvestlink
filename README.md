# HarvestLink

HarvestLink is a React prototype for a Cebu farm-to-market marketplace, connecting farmers, buyers, and partner organizations (donation recipients) through produce listings, orders, surplus donations, messaging, and an admin dashboard.

**Architecture:** accounts, products, orders, and notifications are backed by a real API — an Express backend (`backend/`, deployed on Render) talking to Supabase (Postgres + Auth + Storage). Everything else (donations, messages, market price lookups, delivery routing, reports, demand forecasting) still runs client-side against `localStorage` or free public APIs, pending a later migration pass — see `backend/README.md` for the exact scope and why.

## Features

- Farmer and buyer registration/login
- Admin shortcut login
- Farmer product listing management
- Buyer marketplace browsing
- Product detail pages
- Buyer purchase requests
- Cash or Online payment method selection
- Farmer confirm/reject flow
- Buyer request status history
- Admin dashboard for users, products, requests, and reports placeholder
- Responsive UI for desktop and mobile

## Scripts

- `npm run dev` - start the local Vite dev server
- `npm run build` - create a production build
- `npm run lint` - run ESLint checks

## Run Locally

This app now has two parts that both need to be running: the Express API (`backend/`) and this Vite frontend.

1. **Set up Supabase once** — run `supabase/schema.sql` in your Supabase project's SQL editor, create the two Storage buckets it defines, and turn off "Confirm email" under Authentication settings. Full walkthrough: `backend/README.md`.
2. **Start the backend**:
   ```bash
   cd backend
   cp .env.example .env   # fill in SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
   npm install
   npm run dev             # http://localhost:4000
   ```
3. **Start the frontend** (from the repo root, in a separate terminal):
   ```bash
   cp .env.example .env   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_API_URL
   npm install
   npm run dev
   ```

Open the local URL shown by Vite, usually:

```text
http://127.0.0.1:5173/
```

## Test Accounts

Create farmer, buyer, or partner organization accounts from `/register`.

There's no hardcoded admin login anymore — run `backend/scripts/seedAdmin.js` once to create a real admin account (see `backend/README.md`).

## Deployment

- **Backend → Render**: see `backend/README.md`. `render.yaml` at the repo root configures the service (`rootDir: backend`).
- **Frontend → Vercel**: import this repo, framework preset "Vite" (auto-detected). Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_URL` (your deployed Render URL + `/api`) as project environment variables. `vercel.json` at the repo root handles client-side routing (React Router) so a hard refresh on any page doesn't 404.
- **Database/Auth/Storage → Supabase**: no separate deploy step — it's already live once you run `supabase/schema.sql`.

## How To Test The Main Flow

1. Register as a farmer.
2. Go to `Products`.
3. Add a product with name, category, price, unit, quantity, location, description, and optional image.
4. Logout.
5. Register as a buyer.
6. Go to `Marketplace`.
7. Open the farmer product.
8. Enter a request quantity.
9. Choose `Cash` or `Online payment`.
10. Send the purchase request.
11. Logout as buyer.
12. Login as the farmer.
13. Go to `Requests`.
14. Confirm or reject the buyer request.
15. Logout as farmer.
16. Login as the buyer again.
17. Go to `Requests` and verify the status is `confirmed` or `rejected`.

## LocalStorage Keys

Accounts, products, orders, and notifications now live in Supabase Postgres, not localStorage — see `supabase/schema.sql`. Everything not yet migrated (donations, messages, PSA price overrides, route/geocode/translate caches) still uses `localStorage` under keys prefixed `harvestlink_`; check `src/utils/constants.js`'s `STORAGE_KEYS` for the current list. To reset that leftover local demo data, clear site data in the browser or remove those keys from DevTools.

## Project Structure

```text
src/
  app/
  components/
  features/
  services/
  styles/
  utils/
```

Business logic lives in `src/services`. UI screens and role-specific flows live in `src/features`.
