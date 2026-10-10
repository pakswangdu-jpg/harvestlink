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

If sign-in reports a connection error, compare `VITE_API_URL` with the port
printed by the backend at startup. The server may choose the next port when
the requested port is already occupied. Update the root `.env` to the actual
port and restart Vite. For LAN access, use the PC's LAN address and include
the frontend origin in `CORS_ALLOWED_ORIGIN`; keep the Admin allowlist enabled.
Use the deployed HTTPS API URL in production, never a local/LAN API address.

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

## Admin Network Allowlist

Admin API access now requires a valid Supabase session, an active Admin profile,
and an exact match against backend-only `ADMIN_ALLOWED_IPS`. Missing, malformed,
private, wildcard or empty production entries deny access. The frontend does not
receive the allowlist. No database migration is needed.

Set these in the **Render backend service**, not Vercel:

```env
ADMIN_ALLOWED_IPS=YOUR.PUBLIC.IPV4
TRUSTED_PROXY_IPS=VERIFIED.INGRESS.PROXY.IP/32
```

Comma-separated public IPv4 addresses are supported, with optional whitespace.
The allowed address is the Admin client's public network address, not the backend
server address. `192.168.1.9` is a private LAN address and is not a production entry.
The current requested address was saved in the gitignored local backend `.env`;
this does **not** configure Render. Save the corresponding Render variables and
restart/redeploy the backend. Recheck the public address when the ISP changes it.

**Proxy trust must be verified for the deployed Render ingress.** Set only the
actual ingress proxy addresses/CIDRs that sanitize or append forwarded headers.
Include any verified intermediate proxies needed by that ingress chain. Do not
guess Render outbound ranges, trust every proxy, or use a fixed hop count without
a verified topology. Express resolves `req.ip` right-to-left through this trusted
chain; `x-admin-ip` and arbitrary leftmost `X-Forwarded-For` entries are not used.
See [Express proxy guidance](https://expressjs.com/en/guide/behind-proxies/) and
[Render's ingress overview](https://render.com/articles/how-render-handles-ddos-attacks).
With no trusted proxies, Express uses the socket peer and ignores forwarded
headers. On Render, missing proxy configuration additionally denies Admin access.
Invalid proxy settings fail backend startup instead of enabling blanket trust.

Verify from the deployed backend with both an allowed and a different public
network, including spoofed `X-Forwarded-For` headers, before relying on this gate.
Never add the proxy's address to `ADMIN_ALLOWED_IPS` just to make access work:
that would authorize other visitors using the same proxy. This repository cannot
verify or update the live Render proxy chain automatically.

`/harvestlinkadmin` displays the existing login form for signed-out users, then checks
`/api/auth/admin-access` before redirecting into the Admin dashboard. An Admin session
on `/` does not redirect the public site. Normal `/login` with an Admin account shows
the Admin portal prompt instead of entering the workspace. Internal Admin routes
remain available after authorization; signed-out deep links return to the dedicated
entry. Every Admin route has the same security gate;
every authenticated Admin API request is checked, including shared list endpoints.
The only bootstrap exception is **GET `/api/profiles/me`**, which returns the
caller's own profile so existing session restoration works; it never returns
marketplace Admin records. Profile writes are not exempt. Denials return a generic
403 `ADMIN_NETWORK_NOT_ALLOWED`, clear frontend read caches, and show the restricted
screen without disclosing IP addresses. Background/focus checks do not reset an
already-authorized page's forms, but a failed check removes Admin content.

For explicit local development only:

```env
ADMIN_ALLOWED_IPS=127.0.0.1,192.168.1.9
ADMIN_ALLOW_LOCAL_IPS=true
```

List the connecting Admin device's address, not just the local server's address.
This option is ignored when `NODE_ENV=production` or `RENDER=true`. It does not
allow every IP, and cannot make LAN addresses work through public Render ingress.

This gate protects the HarvestLink HTTP API and Admin route UI. Supabase Auth
remains the session provider. Direct Supabase/storage access continues to depend
on its existing RLS/storage policies; this Express gate is not a replacement for
those policies or infrastructure-level security.

## Folder Structure

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
