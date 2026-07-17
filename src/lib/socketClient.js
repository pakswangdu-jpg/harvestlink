import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL;
if (!API_URL) {
  throw new Error('VITE_API_URL must be set — see .env.example.');
}
// Socket.IO connects to the server's root origin, not the /api-prefixed REST base this
// app's other requests use (see apiClient.js) — same backend process, just a sibling path
// (see backend/src/realtime/orderTracking.js's `path: '/socket.io'`).
const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');

let socket = null;

// A single shared connection reused across every live-tracking view that needs it, opened
// lazily on first use (not at app startup) — most sessions never open a tracking modal at
// all, so there's no reason to hold a websocket open for the whole app lifetime.
export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, { path: '/socket.io', transports: ['websocket', 'polling'] });
  }
  return socket;
}
