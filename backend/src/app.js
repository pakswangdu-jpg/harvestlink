import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();

// A comma-separated CORS_ALLOWED_ORIGIN list covers local dev + the deployed Vercel URL
// at once (e.g. "http://localhost:5173,https://harvestlink-cebu.vercel.app").
//
// Entries may contain a `*` wildcard, which matters for Vercel specifically: every preview
// deployment gets its own generated hostname (harvestlink-cebu-<hash>-<scope>.vercel.app),
// so an exact-match-only list means previews are permanently broken until someone hand-adds
// each URL. "https://harvestlink-cebu*.vercel.app" covers the production domain and all of
// this project's previews, without opening the API to every unrelated site on vercel.app.
// A browser's Origin header is always scheme+host+port with no trailing slash, but a
// dashboard-pasted env var is an easy place to pick up one anyway ("...vercel.app/") — an
// exact-string comparison would then silently reject an origin that looks identical at a
// glance. Stripping a trailing slash and lowercasing (origins are case-insensitive) on BOTH
// sides before comparing closes off that whole class of "looks right, doesn't match" bug
// without weakening the check itself.
function normalizeOrigin(value) {
  return value.trim().replace(/\/+$/, '').toLowerCase();
}

const allowedOriginPatterns = (process.env.CORS_ALLOWED_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

function isOriginAllowed(origin) {
  const normalizedOrigin = normalizeOrigin(origin);
  return allowedOriginPatterns.some((pattern) => {
    if (!pattern.includes('*')) return pattern === normalizedOrigin;
    // Escape every regex metacharacter EXCEPT `*`, then let `*` mean "any run of characters".
    const source = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${source}$`).test(normalizedOrigin);
  });
}

app.use(cors({
  origin(origin, callback) {
    // A request with no Origin header isn't a browser cross-origin call at all (curl,
    // server-to-server, same-origin navigation, Render's own health check) — CORS doesn't
    // apply to it, so it's allowed through rather than rejected.
    if (!origin || isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }
    // Without this line a blocked origin is completely silent server-side: the cors package
    // just omits Access-Control-Allow-Origin and still returns 204, so the browser reports a
    // bare "Failed to fetch" with no status code and the server logs show a normal request.
    // That combination is what makes a CORS misconfiguration so slow to diagnose — log it.
    console.warn(
      `CORS: blocked origin "${origin}". Allowed patterns: ${allowedOriginPatterns.join(', ') || '(none)'}. `
      + 'Set CORS_ALLOWED_ORIGIN to include this origin.',
    );
    callback(null, false);
  },
}));
// `verify` stashes the exact raw bytes of the request body onto req.rawBody, alongside the
// normal parsed req.body — needed by verifyLalamoveWebhook.js, which has to check Lalamove's
// signature against the exact bytes Lalamove signed, not Express's re-serialized JSON (which
// can differ in key order/whitespace and would make every signature check fail). No effect on
// any other route — they simply never read req.rawBody.
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  },
}));

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
