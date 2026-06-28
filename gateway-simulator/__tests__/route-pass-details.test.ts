import { describe, expect, it } from 'vitest';
import { applyRoutePassTamper, buildRoutePassDetails } from '../src/main/users/route-pass-jwt.utils';
import {
  enrichRoutePassClaimsForDisplay,
  formatRoutePassPayloadForDisplay,
} from '../src/renderer/utils/route-pass-display.utils';

describe('buildRoutePassDetails', () => {
  it('returns header, payload, and presentable jwt', () => {
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'user-1',
        aud: ['lock:L1', 'access_control:ac-1'],
        iat: 1_700_000_000,
        exp: 1_700_086_400,
      }),
    ).toString('base64url');
    const jwt = `eyJhbGciOiJFZERTQSJ9.${payload}.signature`;

    const details = buildRoutePassDetails(
      {
        jwt,
        tamper: 'none',
        fetchedAt: '2026-01-01T00:00:00.000Z',
      },
      1_700_000_100,
    );

    expect(details.header.alg).toBe('EdDSA');
    expect(details.payload.sub).toBe('user-1');
    expect(details.presentableJwt).toBe(jwt);
    expect(details.originalPayload.sub).toBe('user-1');
  });

  it('reflects force_expired tamper in presentable payload', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'user-1', exp: 9_999_999_999 })).toString('base64url');
    const jwt = `h.${payload}.sig`;
    const details = buildRoutePassDetails({ jwt, tamper: 'force_expired' }, 1_000);

    expect(details.presentableJwt).not.toBe(jwt);
    expect(details.payload.exp).toBeLessThan(1_000);
    expect(details.originalPayload.exp).toBe(9_999_999_999);
  });

  it('reflects corrupt_signature tamper in presentable jwt', () => {
    const jwt = 'a.b.c';
    const details = buildRoutePassDetails({ jwt, tamper: 'corrupt_signature' }, 1_000);
    expect(details.presentableJwt).toContain('corrupted-signature-bytes');
    expect(applyRoutePassTamper(jwt, 'corrupt_signature', 1_000)).toBe(details.presentableJwt);
  });
});

describe('route-pass-display.utils', () => {
  it('enriches unix timestamps and audience summary', () => {
    const enriched = enrichRoutePassClaimsForDisplay({
      sub: 'user-1',
      iat: 1_700_000_000,
      exp: 1_700_086_400,
      aud: ['lock:L1', 'access_control:ac-1', 'shared_key:u1:L2'],
    });

    expect(enriched.iat).toMatchObject({ unix: 1_700_000_000 });
    expect(enriched.aud).toEqual(['lock:L1', 'access_control:ac-1', 'shared_key:u1:L2']);
    expect(enriched.audience_summary).toMatchObject({
      total: 3,
      locks: ['L1'],
      access_controls: ['ac-1'],
      shared_keys: ['shared_key:u1:L2'],
    });
  });

  it('formats payload as pretty json', () => {
    const formatted = formatRoutePassPayloadForDisplay({ sub: 'user-1', aud: ['lock:L1'] });
    expect(formatted).toContain('"sub": "user-1"');
    expect(formatted).toContain('"audience_summary"');
  });
});
