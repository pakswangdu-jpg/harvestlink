import { ApiError } from '../lib/ApiError.js';
import { sendContactMessageEmail } from '../lib/email.js';

export async function sendContactMessage(req, res) {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const message = String(req.body?.message || '').trim();

  if (!name || !email || !message) {
    throw new ApiError('Name, email, and message are required.', 400);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError('Enter a valid email address.', 400);
  }

  if (name.length > 120 || email.length > 254 || message.length > 5000) {
    throw new ApiError('Contact message is too long.', 400);
  }

  await sendContactMessageEmail({ name, email, message });
  res.status(202).json({ message: 'Your message has been sent.' });
}
