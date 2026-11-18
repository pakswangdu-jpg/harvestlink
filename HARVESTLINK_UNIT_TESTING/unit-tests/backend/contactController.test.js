import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../backend/src/lib/email.js', () => ({
  sendContactMessageEmail: vi.fn(),
}));

import { sendContactMessageEmail } from '../../../backend/src/lib/email.js';
import { sendContactMessage } from '../../../backend/src/controllers/contact.controller.js';

describe('Contact Us controller', () => {
  it('accepts valid input and calls the email service', async () => {
    sendContactMessageEmail.mockResolvedValue({ id: 'email-1' });
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json: vi.fn() };
    await sendContactMessage({
      body: { name: 'Juan', email: 'Juan@gmail.com', message: 'Please help.' },
    }, res);
    expect(sendContactMessageEmail).toHaveBeenCalledWith({
      name: 'Juan', email: 'juan@gmail.com', message: 'Please help.',
    });
    expect(res.statusCode).toBe(202);
  });
  it('rejects missing fields', async () => {
    await expect(sendContactMessage({ body: { name: '', email: '', message: '' } }, {}))
      .rejects.toMatchObject({ status: 400 });
  });
  it('rejects malformed emails', async () => {
    await expect(sendContactMessage({
      body: { name: 'Juan', email: 'not-an-email', message: 'Help' },
    }, {})).rejects.toMatchObject({ status: 400 });
  });
  it('maps provider failures to a 502 service error', async () => {
    sendContactMessageEmail.mockRejectedValue(new Error('Resend rejected recipient'));
    await expect(sendContactMessage({
      body: { name: 'Juan', email: 'juan@gmail.com', message: 'Help' },
    }, {})).rejects.toMatchObject({ status: 502 });
  });
});
