import 'dotenv/config';
import { createServer } from 'http';
import app from './app.js';
import { setupOrderTrackingSocket } from './realtime/orderTracking.js';
import { setupChatSocket } from './realtime/chatPresence.js';

const port = process.env.PORT || 4000;



const allowedOrigins = (process.env.CORS_ALLOWED_ORIGIN || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((origin) => origin.trim());





const httpServer = createServer(app);
const io = setupOrderTrackingSocket(httpServer, allowedOrigins);
setupChatSocket(io);





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




        httpServer.listen(p, '0.0.0.0');
      });
      console.log(`HarvestLink API listening on port ${p}`);
      return p;
    } catch (err) {
      if (err && err.code === 'EADDRINUSE') {
        console.warn(`Port ${p} is in use, trying port ${p + 1}...`);
        p += 1;

        await new Promise((r) => setTimeout(r, 250));
        continue;
      }

      throw err;
    }
  }
  throw new Error(`Unable to bind to a port starting at ${startPort} after ${attempts} attempts.`);
}

tryListen(port).catch((err) => {


  console.error('Failed to start server:', err);
  process.exit(1);
});
