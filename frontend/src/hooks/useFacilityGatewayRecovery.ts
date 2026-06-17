import { useCallback, useEffect, useRef, useState } from 'react';
import { apiService } from '@/services/api.service';
import {
  GatewayRecovery,
  RECOVERY_TERMINAL_STATUSES,
  SwapCandidate,
} from '@/types/gateway-recovery.types';
import { isRecoveryBlocking } from '@/utils/gateway-recovery-progress.utils';

export interface FacilityGatewayRecoveryState {
  candidates: SwapCandidate[];
  recovery: GatewayRecovery | null;
  loading: boolean;
  isBlocking: boolean;
  hasSwapAlert: boolean;
  hasActiveRecovery: boolean;
  refetch: () => Promise<void>;
}

export function useFacilityGatewayRecovery(
  facilityId: string,
  enabled: boolean,
): FacilityGatewayRecoveryState {
  const [candidates, setCandidates] = useState<SwapCandidate[]>([]);
  const [recovery, setRecovery] = useState<GatewayRecovery | null>(null);
  const [loading, setLoading] = useState(enabled);
  const mountedRef = useRef(true);

  const refetch = useCallback(async () => {
    if (!enabled || !facilityId) return;
    try {
      const res = await apiService.getGatewayRecoveryCandidates(facilityId);
      if (!mountedRef.current) return;
      setCandidates(res.data?.candidates || []);
      setRecovery(res.data?.recovery || null);
    } catch {
      if (!mountedRef.current) return;
      setCandidates([]);
      setRecovery(null);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled, facilityId]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }

    void refetch();
    const interval = window.setInterval(() => {
      void refetch();
    }, 12000);

    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
    };
  }, [enabled, refetch]);

  const hasCandidate = candidates.length > 0;
  const isBlocking = isRecoveryBlocking(recovery?.status);
  const hasActiveRecovery = !!recovery && !RECOVERY_TERMINAL_STATUSES.includes(recovery.status);
  const hasFailedRecovery = recovery?.status === 'failed';
  const hasSwapAlert = hasCandidate || hasActiveRecovery || isBlocking || hasFailedRecovery;

  return {
    candidates,
    recovery,
    loading,
    isBlocking,
    hasSwapAlert,
    hasActiveRecovery,
    refetch,
  };
}
