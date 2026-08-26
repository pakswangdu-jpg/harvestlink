import 'dotenv/config';
import { createServer } from 'http';
import app from './app.js';
import { setupOrderTrackingSocket } from './realtime/orderTracking.js';
import { setupChatSocket } from './realtime/chatPresence.js';

const port = process.env.PORT || 4000;

// Same comma-separated origin list app.js already uses for CORS — kept independent here
// (not imported from app.js) so this addition can never change app.js's own behavior.
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim());

// Wrapping the existing Express app in a plain http.Server (instead of calling
// app.listen() directly) changes nothing about how Express itself handles requests —
// it's the same app, same routes, same middleware — this just lets Socket.IO attach to
// the same server/port for the new live-tracking broadcast layer (see realtime/orderTracking.js).
const httpServer = createServer(app);
const io = setupOrderTrackingSocket(httpServer, allowedOrigins);
setupChatSocket(io);

// Attempt to listen on the configured port. If it's in use, try the next few ports
// rather than crashing with an unhandled exception (useful during dev when restarts
// can race). This keeps behavior deterministic in production while improving
// resilience during local development and CI.
async function tryListen(startPort, attempts = 5) {
  let p = Number(startPort) || 4000;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await new Promise((resolve, reject) => {
        const onError = (err) => {
          httpServer.removeListener('listening', onListen);
          reject(err);
        };
        const onListen = () => {
          httpServer.removeListener('error', onError);
          resolve();
        };
        httpServer.once('error', onError);
        httpServer.once('listening', onListen);
        // Explicit '0.0.0.0', not just an implicit default — Node's default (no host arg)
        // already listens on all interfaces, so this doesn't change behavior, but it makes
        // the intent unambiguous for a platform like Render that proxies in from outside the
        // container rather than connecting from localhost.
        httpServer.listen(p, '0.0.0.0');
      });
      console.log(`HarvestLink API listening on port ${p}`);
      return p;
    } catch (err) {
      if (err && err.code === 'EADDRINUSE') {
        console.warn(`Port ${p} is in use, trying port ${p + 1}...`);
        p += 1;
        // brief delay before retrying
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 250));
        continue;
      }
      // Unknown error — rethrow so it surfaces.
      throw err;
    }
  }
  throw new Error(`Unable to bind to a port starting at ${startPort} after ${attempts} attempts.`);
}

tryListen(port).catch((err) => {
  // If this still fails, surface a clear message and exit so the watch process
  // can restart it if appropriate.
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err);
  process.exit(1);
});
