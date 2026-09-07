import { describe, expect, it } from 'vitest';
import { buildZtpClaimUri, tryBuildZtpClaimUri } from '../src/renderer/utils/ztp-sticker-qr.utils';

describe('ztp sticker QR URI', () => {
  it('builds the factory claim deep link', () => {
    const uri = buildZtpClaimUri(
      '11111111-2222-4333-8444-555555555555',
      'A3compressedPublicKeyBase64urlValue',
    );
    expect(uri.startsWith('blulok://gw/claim?')).toBe(true);
    const parsed = new URL(uri);
    expect(parsed.protocol).toBe('blulok:');
    expect(parsed.hostname).toBe('gw');
    expect(parsed.pathname).toBe('/claim');
    expect(parsed.searchParams.get('device_id')).toBe('11111111-2222-4333-8444-555555555555');
    expect(parsed.searchParams.get('pk')).toBe('A3compressedPublicKeyBase64urlValue');
  });

  it('rejects empty fields', () => {
    expect(() => buildZtpClaimUri('', 'pk')).toThrow(/device_id/);
    expect(() => buildZtpClaimUri('id', '  ')).toThrow(/public key/);
  });

  it('tryBuild returns null when incomplete', () => {
    expect(tryBuildZtpClaimUri(undefined, 'pk')).toBeNull();
    expect(tryBuildZtpClaimUri('id', undefined)).toBeNull();
    expect(tryBuildZtpClaimUri('id', 'pk')).toBe(
      'blulok://gw/claim?device_id=id&pk=pk',
    );
  });
});
