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
  const [wsConnected, setWsConnected] = useState(false);
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
          setWsConnected(!!res.connected);
          setLastActivityAt(
            res.lastPongAt ? new Date(res.lastPongAt as string | number).getTime() : null,
          );
        }
      } catch {
        setWsConnected(false);
        setLastActivityAt(null);
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
        wsConnected,
        gatewayType: gateway?.gateway_type,
      }),
    [gateway?.status, gateway?.gateway_type, wsConnected],
  );

  return {
    gateway,
    wsConnected,
    lastActivityAt,
    effectiveStatus,
    loading,
    reload,
  };
}
