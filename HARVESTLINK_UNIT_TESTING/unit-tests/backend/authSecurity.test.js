import { describe, expect, it } from 'vitest';
import { encryptText, decryptText } from '../../../backend/src/lib/security.js';

describe('Authentication security', () => {
  it('round-trips encrypted pending-registration passwords', () => {
    const plain = 'SecurePassword123';
    expect(decryptText(encryptText(plain))).toBe(plain);
  });
});
