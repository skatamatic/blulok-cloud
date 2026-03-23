import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalFacility, ALL_FACILITIES_ID } from '@/contexts/GlobalFacilityContext';
import { UserRole } from '@/types/auth.types';
import { apiService } from '@/services/api.service';
import type { ScopedGeneralStatsData } from '@/types/dashboard.types';

export type { ScopedGeneralStatsData } from '@/types/dashboard.types';

/**
 * Hook that provides general stats data without managing WebSocket subscriptions.
 * Subscriptions are managed by the parent (e.g. DashboardPage via widgetSubscriptionManager).
 * Performs an initial REST load so the dashboard is not stuck on spinners when WS is slow.
 */
export const useGeneralStatsData = () => {
  const { authState } = useAuth();
  const { selectedFacilityId } = useGlobalFacility();
  const scopedFacilityId =
    selectedFacilityId && selectedFacilityId !== ALL_FACILITIES_ID ? selectedFacilityId : undefined;
  const [stats, setStats] = useState<ScopedGeneralStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canAccess =
    authState.user?.role === UserRole.ADMIN ||
    authState.user?.role === UserRole.DEV_ADMIN ||
    authState.user?.role === UserRole.FACILITY_ADMIN ||
    authState.user?.role === UserRole.MAINTENANCE;

  useEffect(() => {
    if (!canAccess || !authState.user) {
      setStats(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await apiService.getDashboardGeneralStats(
          scopedFacilityId ? { facility_id: scopedFacilityId } : undefined
        );
        if (cancelled) return;
        if (res.success && res.data) {
          setStats(res.data);
        } else {
          setError('Could not load dashboard statistics');
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Failed to load dashboard statistics';
          setError(msg);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canAccess, authState.user?.id, scopedFacilityId]);

  const handleStatsUpdate = useCallback(
    (data: ScopedGeneralStatsData) => {
      if (scopedFacilityId) {
        // WebSocket broadcasts are not facility-scoped; avoid overwriting REST-loaded facility stats.
        return;
      }
      setStats(data);
      setLoading(false);
      setError(null);
    },
    [scopedFacilityId]
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
    [handleStatsUpdate, handleError]
  );

  return {
    stats,
    loading,
    error,
    canAccess,
    getHandlers,
  };
};
