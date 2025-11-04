describe('Security Env Validation', () => {
  it('throws when keys are not base64url length 32 bytes', () => {
    jest.isolateModules(() => {
      jest.doMock('@/config/environment', () => ({
        config: {
          nodeEnv: 'production',
          security: {
            opsPrivateKeyB64: 'not-valid!@#',
            opsPublicKeyB64: 'short',
            rootPublicKeyB64: 'also_invalid',
          },
        },
      }));
      const { validateEd25519Env: validate } = require('@/utils/security-env');
      expect(() => validate()).toThrow(/Security configuration error/);
    });
  });

  it('passes with valid-looking base64url 32-byte strings', () => {
    jest.isolateModules(() => {
      const good = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'; // 43 chars -> 32 bytes
      jest.doMock('@/config/environment', () => ({
        config: {
          nodeEnv: 'production',
          security: {
            opsPrivateKeyB64: good,
            opsPublicKeyB64: good,
            rootPublicKeyB64: good,
          },
        },
      }));
      const { validateEd25519Env: validate } = require('@/utils/security-env');
      expect(() => validate()).not.toThrow();
    });
  });
});


