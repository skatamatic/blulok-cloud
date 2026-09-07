import {
  TENANT_UNLOCK_OVERRIDE_REASONS,
  requiresOccupiedUnitOverride,
  unitHasTenant,
  userIsUnitOccupantHint,
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

describe('requiresOccupiedUnitOverride', () => {
  it('is false for vacant units', () => {
    expect(requiresOccupiedUnitOverride({}, 'staff-1')).toBe(false);
  });

  it('is false when current user is the primary tenant', () => {
    expect(
      requiresOccupiedUnitOverride({ primary_tenant: { id: 't1' } }, 't1'),
    ).toBe(false);
  });

  it('is false when current user is a shared tenant', () => {
    expect(
      requiresOccupiedUnitOverride({ shared_tenants: [{ id: 't2' }] }, 't2'),
    ).toBe(false);
  });

  it('is true for staff on occupied units', () => {
    expect(
      requiresOccupiedUnitOverride({ primary_tenant: { id: 't1' } }, 'admin-1'),
    ).toBe(true);
  });

  it('is true when userId unknown and unit occupied', () => {
    expect(requiresOccupiedUnitOverride({ primary_tenant: { id: 't1' } })).toBe(true);
  });
});

describe('userIsUnitOccupantHint', () => {
  it('matches primary tenant id', () => {
    expect(userIsUnitOccupantHint({ primary_tenant: { id: 't1' } }, 't1')).toBe(true);
  });
});
