import { config } from '@/config/environment';
import { validateEd25519Env } from '@/utils/security-env';

describe('Security Env Validation', () => {
  const originalNodeEnv = config.nodeEnv;
  const originalSecurity = { ...config.security };

  afterEach(() => {
    config.nodeEnv = originalNodeEnv;
    Object.assign(config.security, originalSecurity);
  });

  it('throws when keys are not base64url length 32 bytes', () => {
    config.nodeEnv = 'production';
    config.security.opsPrivateKeyB64 = 'not-valid!@#';
    config.security.opsPublicKeyB64 = 'short';
    config.security.rootPublicKeyB64 = 'also_invalid';

    expect(() => validateEd25519Env()).toThrow(/Security configuration error/);
  });

  it('passes with valid base64url 32-byte strings', () => {
    const good = Buffer.alloc(32, 1).toString('base64url');
    config.nodeEnv = 'production';
    config.security.opsPrivateKeyB64 = good;
    config.security.opsPublicKeyB64 = good;
    config.security.rootPublicKeyB64 = good;

    expect(() => validateEd25519Env()).not.toThrow();
  });
});
