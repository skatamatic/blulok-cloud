/**
 * Facility context for dashboard assignment resolution (matches frontend GlobalFacilityContext).
 */
export const ALL_FACILITIES_ID = '__ALL_FACILITIES__';

/** Stable sentinel for global / all-facilities assignment slots in uniq index. */
export const ASSIGNMENT_SCOPE_ENTITY_ZERO = '00000000-0000-0000-0000-000000000000';

export type DashboardAssignmentScope = 'global' | 'facility' | 'user';

export interface ActiveFacilityContext {
  mode: 'all' | 'specific';
  facilityId?: string;
}

export function computeScopeEntityId(
  scope: DashboardAssignmentScope,
  facilityId: string | null | undefined,
  userId: string | null | undefined
): string {
  if (scope === 'user') {
    if (!userId) {
      throw new Error('User assignments require userId for scope_entity_id');
    }
    return userId;
  }
  if (scope === 'facility') {
    return facilityId ?? ASSIGNMENT_SCOPE_ENTITY_ZERO;
  }
  return ASSIGNMENT_SCOPE_ENTITY_ZERO;
}

export function parseActiveFacilityContext(
  activeFacilityId: string | undefined | null,
  userFacilityIds: string[]
): ActiveFacilityContext {
  if (!activeFacilityId || activeFacilityId === ALL_FACILITIES_ID) {
    return { mode: 'all' };
  }
  if (
    userFacilityIds.length > 0 &&
    !userFacilityIds.includes(activeFacilityId)
  ) {
    return { mode: 'all' };
  }
  return { mode: 'specific', facilityId: activeFacilityId };
}
