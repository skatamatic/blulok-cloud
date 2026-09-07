import {
  generateP256KeyPair,
  buildZtpSignPayload,
  signZtpPayload,
  verifyZtpSignature,
  ZTP_PROVISION_PREFIX,
  ZTP_GW_AUTH_PREFIX,
  constantTimeEqualString,
} from '@/services/gateway/ztp/gateway-ztp-crypto.utils';

describe('gateway-ztp-crypto', () => {
  it('round-trips P-256 sign/verify for provision and ops prefixes', () => {
    const { publicKeyCompressedB64url, privateKeyPem } = generateP256KeyPair();
    const deviceId = '123e4567-e89b-12d3-a456-426614174000';
    const nonce = 'test-nonce-abc';

    const provisionPayload = buildZtpSignPayload(ZTP_PROVISION_PREFIX, nonce, deviceId);
    const provisionSig = signZtpPayload(privateKeyPem, provisionPayload);
    expect(verifyZtpSignature(publicKeyCompressedB64url, provisionPayload, provisionSig)).toBe(true);

    const opsPayload = buildZtpSignPayload(ZTP_GW_AUTH_PREFIX, nonce, deviceId);
    const opsSig = signZtpPayload(privateKeyPem, opsPayload);
    expect(verifyZtpSignature(publicKeyCompressedB64url, opsPayload, opsSig)).toBe(true);

    // Cross-prefix must fail
    expect(verifyZtpSignature(publicKeyCompressedB64url, opsPayload, provisionSig)).toBe(false);
  });

  it('rejects tampered signatures and wrong keys', () => {
    const a = generateP256KeyPair();
    const b = generateP256KeyPair();
    const payload = buildZtpSignPayload(ZTP_PROVISION_PREFIX, 'n', '123e4567-e89b-12d3-a456-426614174000');
    const sig = signZtpPayload(a.privateKeyPem, payload);
    expect(verifyZtpSignature(b.publicKeyCompressedB64url, payload, sig)).toBe(false);
    expect(verifyZtpSignature(a.publicKeyCompressedB64url, payload, 'not-a-sig')).toBe(false);
  });

  it('constantTimeEqualString compares correctly', () => {
    expect(constantTimeEqualString('abc', 'abc')).toBe(true);
    expect(constantTimeEqualString('abc', 'abd')).toBe(false);
    expect(constantTimeEqualString('abc', 'ab')).toBe(false);
  });
});
