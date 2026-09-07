import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlobalFacility } from '@/contexts/GlobalFacilityContext';

/**
 * After creating a facility: refresh the sidebar list, select the new facility,
 * and open Facility Setup for it.
 */
export function useOpenCreatedFacility() {
  const navigate = useNavigate();
  const { refresh, setSelectedFacilityId } = useGlobalFacility();

  return useCallback(
    async (facilityId: string) => {
      setSelectedFacilityId(facilityId);
      await refresh();
      navigate(`/facilities/${facilityId}`);
    },
    [navigate, refresh, setSelectedFacilityId],
  );
}
