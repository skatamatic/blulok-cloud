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
  /** Present when claimed via ZTP sticker — required for portal Release. */
  public_key?: string | null;
  released_at?: Date | string | null;
}

type GatewayStatusWsPayload = {
  gateways?: Array<{
    id: string;
    facilityId?: string;
    status: GatewayOperationalStatus;
    lastSeen?: string;
    connected?: boolean | null;
    lastActivityAt?: number | null;
  }>;
};

/**
 * Live gateway connectivity for facility admin UI (Facility tab card + Gateway tab).
 * Uses facility-scoped `gateway_status` WS — no HTTP polling.
 */
export function useFacilityGatewayLiveStatus(
  facilityId: string | undefined,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled !== false && !!facilityId;
  const ws = useWebSocket();
  const [gateway, setGateway] = useState<FacilityGatewayRecord | null>(null);
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
    if (!enabled || !facilityId || !ws) return;

    const subscriptionId = ws.subscribe(
      'gateway_status',
      (data: unknown) => {
        const gateways = (data as GatewayStatusWsPayload)?.gateways ?? [];
        gateways.forEach((row) => {
          if (row.facilityId && row.facilityId !== facilityId) return;
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
      undefined,
      { facility_id: facilityId },
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
    wsConnected: connected === true,
    lastActivityAt,
    effectiveStatus,
    loading,
    reload,
  };
}
