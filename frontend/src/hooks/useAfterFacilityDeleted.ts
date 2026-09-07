import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlobalFacility } from '@/contexts/GlobalFacilityContext';

const STORAGE_KEY = 'selectedFacilityId';

/**
 * After deleting a facility: refresh the sidebar list, select the first
 * remaining facility (if any), and return to the dashboard.
 */
export function useAfterFacilityDeleted() {
  const navigate = useNavigate();
  const { refresh } = useGlobalFacility();

  return useCallback(async () => {
    // Drop stale selection so refresh picks the first remaining facility.
    localStorage.removeItem(STORAGE_KEY);
    await refresh();
    navigate('/dashboard');
  }, [navigate, refresh]);
}
