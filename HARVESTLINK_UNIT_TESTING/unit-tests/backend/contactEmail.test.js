import { describe, expect, it } from 'vitest';
import { sendContactMessageEmail } from '../../../backend/src/lib/email.js';

describe('Contact Us email delivery', () => {
  it('exports the real contact email function', () => {
    expect(typeof sendContactMessageEmail).toBe('function');
  });
});
