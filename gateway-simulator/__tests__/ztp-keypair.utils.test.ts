import { describe, expect, it } from 'vitest';
import { generateP256KeyPair, buildZtpSignPayload, signZtpPayload, ZTP_GW_AUTH_PREFIX } from '../src/main/auth/ztp-keypair.utils';

describe('ztp-keypair.utils', () => {
  it('generates a signable P-256 keypair', () => {
    const { publicKeyCompressedB64url, privateKeyPem } = generateP256KeyPair();
    expect(publicKeyCompressedB64url.length).toBeGreaterThan(40);
    const payload = buildZtpSignPayload(ZTP_GW_AUTH_PREFIX, 'nonce', '123e4567-e89b-12d3-a456-426614174000');
    const sig = signZtpPayload(privateKeyPem, payload);
    expect(sig.length).toBeGreaterThan(20);
  });
});
