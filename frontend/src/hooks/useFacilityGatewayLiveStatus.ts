import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { apiService } from '@/services/api.service';
import {
  resolveEffectiveGatewayStatus,
  type GatewayOperationalStatus,
  type GatewayType,
} from '@/utils/facility-gateway-live-status.utils';

export interface FacilityGatewayRecord {
  id: string;
  facility_id: string | null;
  name: string;
  ip_address?: string;
  mac_address?: string;
  model?: string;
  firmware_version?: string;
  status: GatewayOperationalStatus;
  gateway_type?: GatewayType;
  last_seen?: Date | string;
}

type GatewayStatusWsPayload = {
  gateways?: Array<{
    id: string;
    facilityId?: string;
    status: GatewayOperationalStatus;
    lastSeen?: string;
    // Live inbound /ws/gateway session signal (real-time). `null` when the backend
    // could not resolve liveness for the facility.
    connected?: boolean | null;
    lastActivityAt?: number | null;
  }>;
};

const WS_STATUS_POLL_MS = 5000;

/**
 * Live gateway connectivity for facility admin UI (Facility tab card + Gateway tab).
 * Do not duplicate with deviceHierarchy.gateway.status from getFacility — that field is a load-time snapshot only.
 */
export function useFacilityGatewayLiveStatus(
  facilityId: string | undefined,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled !== false && !!facilityId;
  const ws = useWebSocket();
  const [gateway, setGateway] = useState<FacilityGatewayRecord | null>(null);
  // Live inbound session connectivity. `null` = not yet known (avoids a false "offline" flash
  // and prevents transient cloud-API poll errors from flipping the pill).
  const [connected, setConnected] = useState<boolean | null>(null);
  const [lastActivityAt, setLastActivityAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!facilityId) {
      setGateway(null);
      return;
    }

    const response = await apiService.getGateways({ facility_id: facilityId });
    const rows = (response.gateways || []) as FacilityGatewayRecord[];
    setGateway(rows[0] ?? null);
  }, [facilityId]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await reload();
      } catch (error) {
        console.error('Failed to load facility gateway:', error);
        if (!cancelled) setGateway(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, reload]);

  useEffect(() => {
    if (!enabled || !facilityId) return;

    const pollWsStatus = async () => {
      try {
        const res = await apiService.getGatewayWsStatus(facilityId);
        if (res?.success) {
          setConnected(!!res.connected);
          setLastActivityAt(
            res.lastPongAt ? new Date(res.lastPongAt as string | number).getTime() : null,
          );
        }
      } catch {
        // A failed poll means we couldn't reach the cloud API — it says nothing about the
        // gateway itself. Keep the last known connectivity instead of flapping to offline.
      }
    };

    void pollWsStatus();
    const timer = setInterval(pollWsStatus, WS_STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, facilityId]);

  useEffect(() => {
    if (!enabled || !facilityId || !ws) return;

    const subscriptionId = ws.subscribe(
      'gateway_status',
      (data: unknown) => {
        const gateways = (data as GatewayStatusWsPayload)?.gateways ?? [];
        gateways.forEach((row) => {
          if (row.facilityId && row.facilityId !== facilityId) return;
          // Real-time liveness from the inbound /ws/gateway session — primary pill driver.
          if (typeof row.connected === 'boolean') {
            setConnected(row.connected);
          }
          if (typeof row.lastActivityAt === 'number') {
            setLastActivityAt(row.lastActivityAt);
          }
          setGateway((prev) => {
            if (!prev || prev.id !== row.id) return prev;
            return {
              ...prev,
              status: row.status,
              last_seen: row.lastSeen ?? prev.last_seen,
            };
          });
        });
      },
    );

    return () => {
      if (subscriptionId) ws.unsubscribe(subscriptionId);
    };
  }, [enabled, facilityId, ws]);

  const effectiveStatus = useMemo(
    () =>
      resolveEffectiveGatewayStatus({
        dbStatus: gateway?.status,
        connected,
      }),
    [gateway?.status, connected],
  );

  return {
    gateway,
    // True only when the inbound session is confirmed up. Consumers use this for the
    // "session active" affordances (e.g. unassigned-gateway banner).
    wsConnected: connected === true,
    lastActivityAt,
    effectiveStatus,
    loading,
    reload,
  };
}
