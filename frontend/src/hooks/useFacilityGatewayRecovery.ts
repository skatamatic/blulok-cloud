import { useCallback, useEffect, useRef, useState } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';
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

type RecoveryStatusWsPayload = {
  facilityId?: string;
  candidates?: SwapCandidate[];
  sessions?: FacilityGatewaySession[];
  recovery?: GatewayRecovery | null;
};

/**
 * Facility-scoped swap/recovery candidates via `gateway_recovery_status` WS.
 * Subscribe only while the Gateway setup UI is mounted (`enabled`).
 */
export function useFacilityGatewayRecovery(
  facilityId: string,
  enabled: boolean,
): FacilityGatewayRecoveryState {
  const ws = useWebSocket();
  const [candidates, setCandidates] = useState<SwapCandidate[]>([]);
  const [sessions, setSessions] = useState<FacilityGatewaySession[]>([]);
  const [recovery, setRecovery] = useState<GatewayRecovery | null>(null);
  const [loading, setLoading] = useState(enabled);
  const mountedRef = useRef(true);

  const applySnapshot = useCallback((data: RecoveryStatusWsPayload | null | undefined) => {
    if (!data) return;
    if (data.facilityId && data.facilityId !== facilityId) return;
    setCandidates(data.candidates || []);
    setSessions(data.sessions || []);
    setRecovery(data.recovery ?? null);
  }, [facilityId]);

  const refetch = useCallback(async (opts?: { silent?: boolean }) => {
    if (!enabled || !facilityId) return;
    try {
      const res = await apiService.getGatewayRecoveryCandidates(facilityId);
      if (!mountedRef.current) return;
      applySnapshot({
        facilityId,
        candidates: res.data?.candidates || [],
        sessions: res.data?.sessions || [],
        recovery: res.data?.recovery || null,
      });
    } catch {
      if (!mountedRef.current) return;
      if (!opts?.silent) {
        setCandidates([]);
        setSessions([]);
        setRecovery(null);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [applySnapshot, enabled, facilityId]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }

    setLoading(true);
    void refetch();

    return () => {
      mountedRef.current = false;
    };
  }, [enabled, refetch]);

  useEffect(() => {
    if (!enabled || !facilityId || !ws) return;

    const subscriptionId = ws.subscribe(
      'gateway_recovery_status',
      (data: unknown) => {
        applySnapshot(data as RecoveryStatusWsPayload);
        setLoading(false);
      },
      undefined,
      { facility_id: facilityId },
    );

    return () => {
      if (subscriptionId) ws.unsubscribe(subscriptionId);
    };
  }, [applySnapshot, enabled, facilityId, ws]);

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
