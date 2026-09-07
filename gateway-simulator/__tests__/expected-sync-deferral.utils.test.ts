import { describe, expect, it } from 'vitest';
import {
  expectedSyncDeferralMessage,
  isExpectedSyncDeferral,
} from '../src/main/net/expected-sync-deferral.utils';

describe('expected-sync-deferral.utils', () => {
  it('treats swap_candidate not-bound and recovery-blocked as expected deferrals', () => {
    expect(
      isExpectedSyncDeferral('swap_candidate', {
        ok: false,
        status: 403,
        code: 'not_bound_gateway',
        message: 'Not bound',
      }),
    ).toBe(true);
    expect(
      isExpectedSyncDeferral('swap_candidate', {
        ok: false,
        status: 409,
        code: 'recovery_in_progress',
        message: 'Recovery running',
      }),
    ).toBe(true);
    expect(
      isExpectedSyncDeferral('primary', {
        ok: false,
        status: 403,
        code: 'not_bound_gateway',
        message: 'Not bound',
      }),
    ).toBe(false);
  });

  it('returns swap candidate operator message', () => {
    expect(expectedSyncDeferralMessage('swap_candidate')).toContain('swap candidate');
    expect(expectedSyncDeferralMessage('primary')).toBeUndefined();
  });
});
