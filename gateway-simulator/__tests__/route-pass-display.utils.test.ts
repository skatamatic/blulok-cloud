import { describe, expect, it } from 'vitest';
import {
  enrichRoutePassClaimsForDisplay,
  formatRoutePassHeaderForDisplay,
  formatRoutePassJson,
  formatRoutePassPayloadForDisplay,
  routePassTamperHelpText,
  routePassTamperLabel,
} from '../src/renderer/utils/route-pass-display.utils';

describe('route-pass-display.utils', () => {
  it('enrichRoutePassClaimsForDisplay formats time claims and audience', () => {
    const enriched = enrichRoutePassClaimsForDisplay({
      iat: 1_700_000_000,
      exp: 1_700_086_400,
      aud: ['lock:L-1', 'access_control:AC-1', 'shared_key:sk-1', 'other'],
      sub: 'tenant-1',
    });
    expect(enriched.iat).toMatchObject({ unix: 1_700_000_000 });
    expect(enriched.aud).toEqual(['lock:L-1', 'access_control:AC-1', 'shared_key:sk-1', 'other']);
    expect(enriched.audience_summary).toMatchObject({
      total: 4,
      locks: ['L-1'],
      access_controls: ['AC-1'],
      shared_keys: ['shared_key:sk-1'],
      other: ['other'],
    });
  });

  it('formatRoutePassJson pretty prints values', () => {
    expect(formatRoutePassJson({ a: 1 })).toContain('\n');
    expect(formatRoutePassPayloadForDisplay({ sub: 'x' })).toContain('sub');
    expect(formatRoutePassHeaderForDisplay({ alg: 'RS256' })).toContain('RS256');
  });

  it('routePassTamperLabel and help text cover all modes', () => {
    expect(routePassTamperLabel('none')).toBe('Valid (as fetched)');
    expect(routePassTamperLabel('force_expired')).toContain('Expired');
    expect(routePassTamperLabel('corrupt_signature')).toContain('Bad signature');
    expect(routePassTamperHelpText('force_expired')).toContain('expired');
    expect(routePassTamperHelpText('corrupt_signature')).toContain('signature');
    expect(routePassTamperHelpText('none')).toContain('cached route pass');
  });
});
