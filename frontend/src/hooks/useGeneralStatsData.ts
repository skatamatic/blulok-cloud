import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalFacility } from '@/contexts/GlobalFacilityContext';
import { getScopedFacilityId } from '@/utils/globalFacilityScope.utils';
import { UserRole } from '@/types/auth.types';
import { apiService } from '@/services/api.service';
import { useLockDeviceRealtime } from '@/hooks/useLockDeviceRealtime';
import type { ScopedGeneralStatsData } from '@/types/dashboard.types';

export type { ScopedGeneralStatsData } from '@/types/dashboard.types';

/**
 * Dashboard general stats: initial REST load plus WebSocket-driven updates.
 * Aggregate (all facilities) stats apply `general_stats_update` payloads directly.
 * Facility-scoped stats refetch via REST when `device_status` / `units` signals arrive,
 * because WS broadcasts are user-scoped rather than per-facility.
 */
export const useGeneralStatsData = () => {
  const { authState } = useAuth();
  const { selectedFacilityId } = useGlobalFacility();
  const scopedFacilityId = getScopedFacilityId(selectedFacilityId);
  const [stats, setStats] = useState<ScopedGeneralStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canAccess =
    authState.user?.role === UserRole.ADMIN ||
    authState.user?.role === UserRole.DEV_ADMIN ||
    authState.user?.role === UserRole.FACILITY_ADMIN ||
    authState.user?.role === UserRole.MAINTENANCE;

  const refetchStats = useCallback(
    async (options?: { background?: boolean }) => {
      if (!canAccess || !authState.user) {
        return;
      }

      try {
        if (!options?.background) {
          setLoading(true);
          setError(null);
        }

        const res = await apiService.getDashboardGeneralStats(
          scopedFacilityId ? { facility_id: scopedFacilityId } : undefined,
        );

        if (res.success && res.data) {
          setStats(res.data);
          setError(null);
        } else if (!options?.background) {
          setError('Could not load dashboard statistics');
        }
      } catch (e) {
        if (!options?.background) {
          const msg = e instanceof Error ? e.message : 'Failed to load dashboard statistics';
          setError(msg);
        }
      } finally {
        if (!options?.background) {
          setLoading(false);
        }
      }
    },
    [canAccess, authState.user, scopedFacilityId],
  );

  const refetchStatsRef = useRef(refetchStats);
  refetchStatsRef.current = refetchStats;

  useEffect(() => {
    if (!canAccess || !authState.user) {
      setStats(null);
      setLoading(false);
      setError(null);
      return;
    }

    void refetchStats();
  }, [canAccess, authState.user?.id, scopedFacilityId, refetchStats]);

  useLockDeviceRealtime({
    enabled: canAccess && !!scopedFacilityId,
    facilityId: scopedFacilityId,
    debouncedRefresh: () => {
      void refetchStatsRef.current({ background: true });
    },
    debounceMs: 500,
  });

  const handleStatsUpdate = useCallback(
    (data: ScopedGeneralStatsData) => {
      if (scopedFacilityId) {
        // Facility-scoped REST is authoritative; WS aggregate must not overwrite.
        return;
      }
      setStats(data);
      setLoading(false);
      setError(null);
    },
    [scopedFacilityId],
  );

  const handleError = useCallback((err: string) => {
    setError(err);
    setLoading(false);
  }, []);

  const getHandlers = useCallback(
    () => ({
      onData: handleStatsUpdate,
      onError: handleError,
    }),
    [handleStatsUpdate, handleError],
  );

  return {
    stats,
    loading,
    error,
    canAccess,
    getHandlers,
  };
};
