import { useCallback, useEffect, useRef, useState } from 'react';
import { apiService } from '@/services/api.service';
import {
  GatewayRecovery,
  RECOVERY_TERMINAL_STATUSES,
  SwapCandidate,
  type FacilityGatewaySession,
} from '@/types/gateway-recovery.types';
import {
  isRecoveryBlocking,
  resolveAvailableCandidate,
  resolveProductionGatewayId,
} from '@/utils/gateway-recovery-progress.utils';

export interface FacilityGatewayRecoveryState {
  candidates: SwapCandidate[];
  sessions: FacilityGatewaySession[];
  recovery: GatewayRecovery | null;
  loading: boolean;
  isBlocking: boolean;
  hasSwapAlert: boolean;
  hasActiveRecovery: boolean;
  refetch: (opts?: { silent?: boolean }) => Promise<void>;
}

export function useFacilityGatewayRecovery(
  facilityId: string,
  enabled: boolean,
): FacilityGatewayRecoveryState {
  const [candidates, setCandidates] = useState<SwapCandidate[]>([]);
  const [sessions, setSessions] = useState<FacilityGatewaySession[]>([]);
  const [recovery, setRecovery] = useState<GatewayRecovery | null>(null);
  const [loading, setLoading] = useState(enabled);
  const mountedRef = useRef(true);

  const refetch = useCallback(async (opts?: { silent?: boolean }) => {
    if (!enabled || !facilityId) return;
    try {
      const res = await apiService.getGatewayRecoveryCandidates(facilityId);
      if (!mountedRef.current) return;
      setCandidates(res.data?.candidates || []);
      setSessions(res.data?.sessions || []);
      setRecovery(res.data?.recovery || null);
    } catch {
      if (!mountedRef.current) return;
      // Keep the last known recovery snapshot during background polls so banners
      // do not flicker on transient API errors.
      if (!opts?.silent) {
        setCandidates([]);
        setSessions([]);
        setRecovery(null);
      }
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
      void refetch({ silent: true });
    }, 12000);

    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
    };
  }, [enabled, refetch]);

  const productionGatewayId = resolveProductionGatewayId(sessions, undefined, recovery);
  const candidate = resolveAvailableCandidate(recovery, candidates, sessions, productionGatewayId);
  const hasCandidate = candidate.connected === true;
  const isBlocking = isRecoveryBlocking(recovery?.status);
  const hasActiveRecovery = !!recovery && !RECOVERY_TERMINAL_STATUSES.includes(recovery.status);
  const hasFailedRecovery = recovery?.status === 'failed';
  const hasSwapAlert = hasCandidate || hasActiveRecovery || isBlocking || hasFailedRecovery;

  return {
    candidates,
    sessions,
    recovery,
    loading,
    isBlocking,
    hasSwapAlert,
    hasActiveRecovery,
    refetch,
  };
}
