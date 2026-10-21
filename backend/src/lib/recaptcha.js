import { ApiError } from './ApiError.js';

function captchaError(message, status, code) {
  const error = new ApiError(message, status);
  error.code = code;
  return error;
}

export async function verifyRecaptchaToken(token, {
  secretKey = process.env.RECAPTCHA_SECRET_KEY,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!secretKey) {
    throw captchaError('Security verification is not configured.', 503, 'CAPTCHA_UNAVAILABLE');
  }
  if (typeof token !== 'string' || !token.trim()) {
    throw captchaError('Please complete the security verification.', 400, 'CAPTCHA_REQUIRED');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetchImpl('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: secretKey, response: token }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw captchaError('Security verification is temporarily unavailable.', 503, 'CAPTCHA_UNAVAILABLE');
    }

    let result;
    try {
      result = await response.json();
    } catch {
      throw captchaError('Security verification is temporarily unavailable.', 503, 'CAPTCHA_UNAVAILABLE');
    }
    if (result?.success !== true) {
      throw captchaError('Security verification failed. Please try again.', 400, 'CAPTCHA_FAILED');
    }
    return true;
  } catch (error) {
    if (error.code === 'CAPTCHA_FAILED' || error.code === 'CAPTCHA_UNAVAILABLE') throw error;
    throw captchaError('Security verification is temporarily unavailable.', 503, 'CAPTCHA_UNAVAILABLE');
  } finally {
    clearTimeout(timeoutId);
  }
}
