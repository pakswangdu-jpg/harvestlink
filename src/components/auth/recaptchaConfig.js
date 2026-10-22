// Vite selects the value from the active environment files at build time:
// `.env.local` for local development and Vercel's environment for production.
// The site key is public; the matching secret is verified by the backend only.
export const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY?.trim();
export const isRecaptchaConfigured = Boolean(RECAPTCHA_SITE_KEY);
