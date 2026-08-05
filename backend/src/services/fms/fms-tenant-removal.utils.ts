/** Metadata flag set when a tenant was removed from this facility's FMS and the change was applied. */
export const FMS_MAPPING_REMOVED_AT_KEY = 'removed_from_fms_at';

/** MySQL/driver may return is_active as 0/1 — treat both boolean false and 0 as inactive. */
export function isUserInactive(user: { is_active?: boolean | number | null } | null | undefined): boolean {
  if (!user) return false;
  return user.is_active === false || user.is_active === 0;
}

export function isFmsMappingMarkedRemoved(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return Boolean(metadata?.[FMS_MAPPING_REMOVED_AT_KEY]);
}

/**
 * Whether this FMS user mapping is considered removed from the facility.
 * Covers stamped rows and legacy inactive tenants with no facility assignments.
 */
export function isFmsUserRemovedFromFacility(
  mapping: { metadata?: Record<string, unknown> | null | undefined } | null | undefined,
  user: { is_active?: boolean | number } | null | undefined,
  facilityAssignmentCount: number,
): boolean {
  if (mapping && isFmsMappingMarkedRemoved(mapping.metadata)) {
    return true;
  }
  // Legacy rows before we stamped mappings — deactivated with no facility access left.
  if (user && isUserInactive(user) && facilityAssignmentCount === 0) {
    return true;
  }
  return false;
}

export function stampFmsMappingRemoved(
  metadata: Record<string, unknown> | null | undefined,
  removedAt: Date = new Date(),
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    [FMS_MAPPING_REMOVED_AT_KEY]: removedAt.toISOString(),
  };
}

export function clearFmsMappingRemoved(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const next = { ...(metadata ?? {}) };
  delete next[FMS_MAPPING_REMOVED_AT_KEY];
  return next;
}
