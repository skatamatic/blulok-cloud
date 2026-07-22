/**
 * Required override reasons when remotely unlocking a unit that has a tenant.
 * Codes must stay in sync with backend/src/constants/tenant-unlock-override.constants.ts
 * (asserted by frontend/src/__tests__/constants/tenantUnlockOverride.constants.test.ts).
 */
export const TENANT_UNLOCK_OVERRIDE_REASONS = [
  {
    code: 'tenant_locked_phone',
    label: 'Tenant locked phone in unit',
  },
  {
    code: 'emergency',
    label: 'Emergency (Fire, flood, other)',
  },
  {
    code: 'testing_maintenance',
    label: 'Testing and/or Maintenance',
  },
] as const;

export type TenantUnlockOverrideReasonCode =
  (typeof TENANT_UNLOCK_OVERRIDE_REASONS)[number]['code'];

export const TENANT_UNLOCK_OVERRIDE_NOTES_MAX_LENGTH = 500;

export type TenantUnlockOverridePayload = {
  reason: TenantUnlockOverrideReasonCode;
  notes?: string;
};

/** Shapes used across unit lists, device details, and BluDesign viewer. */
export type UnitTenantHints = {
  primary_tenant?: { id?: string } | null;
  shared_tenants?: Array<{ id?: string }> | null;
  tenant_name?: string | null;
  /** BluDesign viewer occupancy payload */
  tenant?: { id?: string } | null;
};

export function unitHasTenant(unit: UnitTenantHints): boolean {
  if (unit.primary_tenant?.id) return true;
  if (unit.tenant?.id) return true;
  if (unit.shared_tenants && unit.shared_tenants.length > 0) return true;
  if (typeof unit.tenant_name === 'string' && unit.tenant_name.trim().length > 0) {
    return true;
  }
  return false;
}
