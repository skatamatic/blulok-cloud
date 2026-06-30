import { ALL_FACILITIES_ID } from '@/contexts/GlobalFacilityContext';

/** Detail routes opened from Facility Setup that should close when the global facility changes. */
const FACILITY_SETUP_DETAIL_PATH_PATTERNS = [
  /^\/units\/[^/]+$/,
  /^\/devices\/[^/]+$/,
  /^\/facilities\/[^/]+\/edit$/,
];

export function isFacilitySetupDetailRoute(pathname: string): boolean {
  return FACILITY_SETUP_DETAIL_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

export function resolveFacilitySetupPath(
  selectedFacilityId: string | null,
  isAllFacilitiesSelected: boolean,
): string {
  if (isAllFacilitiesSelected || !selectedFacilityId || selectedFacilityId === ALL_FACILITIES_ID) {
    return '/facilities';
  }
  return `/facilities/${selectedFacilityId}`;
}
