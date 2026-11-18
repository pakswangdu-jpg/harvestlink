import assert from 'node:assert/strict';
import { test } from 'node:test';

test('contact submission returns success only after Resend accepts the email', async (t) => {
  let deliveryError = null;
  t.mock.module('../src/lib/email.js', {
    namedExports: {
      async sendContactMessageEmail(payload) {
        if (deliveryError) throw deliveryError;
        return { id: 'email-accepted', payload };
      },
    },
  });
  const { sendContactMessage } = await import('../src/controllers/contact.controller.js');

  const invoke = async (body) => {
    let response;
    await sendContactMessage(
      { body },
      { status(code) { this.statusCode = code; return this; }, json(payload) { response = payload; } },
    );
    return response;
  };

  const success = await invoke({
    name: 'Juan',
    email: 'juan@gmail.com',
    message: 'Please help with my account.',
  });
  assert.deepEqual(success, { message: 'Your message has been sent.' });

  deliveryError = new Error('Gmail rejected recipient');
  await assert.rejects(invoke({
    name: 'Juan',
    email: 'juan@gmail.com',
    message: 'Please help with my account.',
  }), (error) => error.status === 502 && /Gmail rejected recipient/.test(error.message));
});
