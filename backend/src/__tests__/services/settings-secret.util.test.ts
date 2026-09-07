import {
  encryptSecret,
  decryptSecret,
  isEncryptedSecret,
  isSecretMask,
  maskSecret,
  SECRET_MASK,
} from '@/utils/settings-secret.util';

jest.mock('@/config/environment', () => ({
  config: {
    settingsEncryptionKey: 'test-settings-encryption-key-32b!',
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

describe('settings-secret.util', () => {
  it('encrypts and decrypts round-trip', () => {
    const plain = 'super-secret-token';
    const enc = encryptSecret(plain);
    expect(isEncryptedSecret(enc)).toBe(true);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it('passes through legacy plaintext on decrypt', () => {
    expect(decryptSecret('legacy-plaintext')).toBe('legacy-plaintext');
  });

  it('masks secrets for API responses', () => {
    expect(maskSecret('anything')).toBe(SECRET_MASK);
    expect(isSecretMask(SECRET_MASK)).toBe(true);
    expect(maskSecret('')).toBe('');
  });

  it('is idempotent for already-encrypted values', () => {
    const enc = encryptSecret('once');
    expect(encryptSecret(enc)).toBe(enc);
  });
});
