import { useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/** Max facilities passed to histogram / multi-facility API filters. */
export const DASHBOARD_FACILITY_SCOPE_LIMIT = 50;

export type DashboardFacilityWsFilters =
  | { facilityId: string }
  | { facilityIds: string[] }
  | undefined;

/**
 * Shared facility scope for dashboard widgets (notifications, activity, histogram, etc.).
 * - Single facility selected → filter to that facility.
 * - All facilities + global admin → no filter (all accessible data).
 * - All facilities + scoped role → user's assigned facility IDs.
 */
export function useDashboardFacilityScope(facilityFilter?: string) {
  const { authState } = useAuth();
  const canAccessAllFacilities =
    authState.user?.role === 'admin' || authState.user?.role === 'dev_admin';
  const allowedFacilityIds = authState.user?.facilityIds;

  const facilityIdsForApi = useMemo((): string[] | undefined => {
    if (facilityFilter) {
      return [facilityFilter];
    }
    if (canAccessAllFacilities) {
      return undefined;
    }
    const ids = allowedFacilityIds?.slice(0, DASHBOARD_FACILITY_SCOPE_LIMIT);
    return ids?.length ? ids : undefined;
  }, [facilityFilter, canAccessAllFacilities, allowedFacilityIds]);

  const wsFilters = useMemo((): DashboardFacilityWsFilters => {
    if (facilityFilter) {
      return { facilityId: facilityFilter };
    }
    if (facilityIdsForApi?.length) {
      return { facilityIds: facilityIdsForApi };
    }
    return undefined;
  }, [facilityFilter, facilityIdsForApi]);

  const matchesFacilityScope = useCallback(
    (facilityId: string | null | undefined): boolean => {
      if (facilityFilter) {
        return facilityId === facilityFilter;
      }
      if (canAccessAllFacilities) {
        return true;
      }
      if (!facilityId) {
        return false;
      }
      if (!allowedFacilityIds?.length) {
        return false;
      }
      return allowedFacilityIds.includes(facilityId);
    },
    [facilityFilter, canAccessAllFacilities, allowedFacilityIds],
  );

  return {
    canAccessAllFacilities,
    allowedFacilityIds,
    facilityIdsForApi,
    wsFilters,
    matchesFacilityScope,
  };
}
