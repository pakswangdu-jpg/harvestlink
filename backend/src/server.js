import 'dotenv/config';
import { createServer } from 'http';
import app from './app.js';
import { setupOrderTrackingSocket } from './realtime/orderTracking.js';

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
setupOrderTrackingSocket(httpServer, allowedOrigins);

httpServer.listen(port, () => {
  console.log(`HarvestLink API listening on port ${port}`);
});
