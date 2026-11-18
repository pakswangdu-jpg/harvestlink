export function getAppUrl() {
  return process.env.APP_URL || 'https://harvestlink.dev';
}

export function getAllowedOrigins() {
  return [
    ...(process.env.CORS_ALLOWED_ORIGIN || 'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174').split(','),
    getAppUrl(),
    'https://www.harvestlink.dev',
  ].map((origin) => origin.trim().replace(/\/+$/, '')).filter(Boolean);
}
