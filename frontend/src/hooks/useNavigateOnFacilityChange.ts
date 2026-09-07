import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGlobalFacility } from '@/contexts/GlobalFacilityContext';
import {
  isFacilitySetupDetailRoute,
  resolveFacilitySetupPath,
} from '@/utils/facility-setup-navigation.utils';

/**
 * When the sidebar facility selector changes while a unit/device (or facility edit)
 * detail view is open, return to Facility Setup for the newly selected facility.
 */
export function useNavigateOnFacilityChange(): void {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedFacilityId, isAllFacilitiesSelected, isLoading } = useGlobalFacility();
  const previousFacilityIdRef = useRef<string | null>(null);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (isLoading) return;

    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      previousFacilityIdRef.current = selectedFacilityId;
      return;
    }

    if (previousFacilityIdRef.current === selectedFacilityId) return;
    previousFacilityIdRef.current = selectedFacilityId;

    if (!isFacilitySetupDetailRoute(location.pathname)) return;

    navigate(
      resolveFacilitySetupPath(selectedFacilityId, isAllFacilitiesSelected),
      { replace: true },
    );
  }, [
    selectedFacilityId,
    isAllFacilitiesSelected,
    isLoading,
    location.pathname,
    navigate,
  ]);
}
