import {
  TENANT_UNLOCK_OVERRIDE_REASONS,
  unitHasTenant,
} from '@/constants/tenantUnlockOverride.constants';
import { TENANT_UNLOCK_OVERRIDE_REASONS as BE_REASONS } from '../../../../backend/src/constants/tenant-unlock-override.constants';

describe('tenant unlock override constants', () => {
  it('keeps FE reason codes/labels in sync with backend', () => {
    expect([...TENANT_UNLOCK_OVERRIDE_REASONS]).toEqual([...BE_REASONS]);
  });
});

describe('unitHasTenant', () => {
  it('is true for primary tenant', () => {
    expect(unitHasTenant({ primary_tenant: { id: 't1' } })).toBe(true);
  });

  it('is true for BluDesign viewer tenant shape', () => {
    expect(unitHasTenant({ tenant: { id: 't-viewer' } })).toBe(true);
  });

  it('is true for shared tenants', () => {
    expect(unitHasTenant({ shared_tenants: [{ id: 't2' }] })).toBe(true);
  });

  it('is true for tenant_name display-only payloads', () => {
    expect(unitHasTenant({ tenant_name: 'Alex Kim' })).toBe(true);
  });

  it('is false when vacant', () => {
    expect(unitHasTenant({})).toBe(false);
    expect(
      unitHasTenant({
        primary_tenant: null,
        shared_tenants: [],
        tenant_name: null,
        tenant: null,
      }),
    ).toBe(false);
  });
});
