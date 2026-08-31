import { ALL_FACILITIES_ID } from '@/contexts/GlobalFacilityContext';

/** Facility UUID when a single facility is selected; undefined for "All facilities" or unset. */
export function getScopedFacilityId(selectedFacilityId: string | null): string | undefined {
  if (!selectedFacilityId || selectedFacilityId === ALL_FACILITIES_ID) {
    return undefined;
  }
  return selectedFacilityId;
}
