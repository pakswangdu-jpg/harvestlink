import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL;
if (!API_URL) {
  throw new Error('VITE_API_URL must be set — see .env.example.');
}
const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, { path: '/socket.io', transports: ['websocket', 'polling'] });
  }
  return socket;
}
