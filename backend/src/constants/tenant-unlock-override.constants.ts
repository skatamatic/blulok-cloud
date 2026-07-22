/**
 * Required override reasons when remotely unlocking a unit that has a tenant.
 * Codes are persisted on access-history activity metadata.
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

export const TENANT_UNLOCK_OVERRIDE_REASON_CODES: TenantUnlockOverrideReasonCode[] =
  TENANT_UNLOCK_OVERRIDE_REASONS.map((r) => r.code);

export const TENANT_UNLOCK_OVERRIDE_REASON_LABELS: Record<
  TenantUnlockOverrideReasonCode,
  string
> = Object.fromEntries(
  TENANT_UNLOCK_OVERRIDE_REASONS.map((r) => [r.code, r.label]),
) as Record<TenantUnlockOverrideReasonCode, string>;

export const TENANT_UNLOCK_OVERRIDE_NOTES_MAX_LENGTH = 500;

export function isTenantUnlockOverrideReasonCode(
  value: unknown,
): value is TenantUnlockOverrideReasonCode {
  return (
    typeof value === 'string'
    && (TENANT_UNLOCK_OVERRIDE_REASON_CODES as readonly string[]).includes(value)
  );
}

export function labelForTenantUnlockOverrideReason(
  code: TenantUnlockOverrideReasonCode,
): string {
  return TENANT_UNLOCK_OVERRIDE_REASON_LABELS[code];
}
