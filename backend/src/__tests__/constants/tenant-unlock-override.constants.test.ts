import {
  isTenantUnlockOverrideReasonCode,
  labelForTenantUnlockOverrideReason,
  TENANT_UNLOCK_OVERRIDE_REASON_CODES,
} from '@/constants/tenant-unlock-override.constants';

describe('tenant-unlock-override.constants', () => {
  it('includes the three product reasons', () => {
    expect(TENANT_UNLOCK_OVERRIDE_REASON_CODES).toEqual([
      'tenant_locked_phone',
      'emergency',
      'testing_maintenance',
    ]);
  });

  it('validates reason codes', () => {
    expect(isTenantUnlockOverrideReasonCode('emergency')).toBe(true);
    expect(isTenantUnlockOverrideReasonCode('not-a-reason')).toBe(false);
    expect(isTenantUnlockOverrideReasonCode(null)).toBe(false);
  });

  it('maps codes to labels', () => {
    expect(labelForTenantUnlockOverrideReason('emergency')).toBe(
      'Emergency (Fire, flood, other)',
    );
  });
});
