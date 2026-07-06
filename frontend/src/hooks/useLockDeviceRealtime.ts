import { useCallback, useEffect, useRef } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import {
  LockDeviceSnapshot,
  normalizeDeviceStatusWsPayload,
} from '@/utils/deviceStatusWs.utils';

/**
 * Central real-time wiring for lock + device telemetry from the dashboard WebSocket.
 *
 * Inbound facility gateways use `/ws/gateway` + `PROXY_REQUEST` to hit internal APIs (e.g.
 * `POST /internal/gateway/devices/state`); the backend persists state and emits
 * `device_status_update` + `units_update` to app clients. All surfaces that show lock status
 * should use this hook (or patterns it encapsulates) so behavior stays consistent.
 */
export interface UseLockDeviceRealtimeParams {
  enabled?: boolean;
  /** BluLok device UUID — server narrows `device_status` subscription when set. */
  deviceId?: string | null;
  /** Scope `device_status` pushes to one facility (e.g. facility devices tab). */
  facilityId?: string | null;
  /** Merge snapshots into local state (detail pages, lock widget). */
  onDeviceRows?: (rows: LockDeviceSnapshot[]) => void;
  /** Debounced full reload (list pages). */
  debouncedRefresh?: () => void;
  /** If provided, return false to skip scheduling refresh for this payload. */
  debounceRefreshFilter?: (payload: unknown) => boolean;
  debounceMs?: number;
  /**
   * When using debouncedRefresh, also subscribe to coarse `units_update` (default true).
   * Set false for device-list pages that only need device_status.
   */
  subscribeUnitsForRefresh?: boolean;
  /**
   * When using debouncedRefresh, subscribe to granular device_status (default true).
   * Set false for unit-list tabs that only need units_update.
   */
  /**
   * When true (default), also subscribe to `gateway_status` and debounce refresh on
   * connect/disconnect so list/detail pages reload when reachability coercion changes
   * (e.g. network_infra-only facilities with no operational device rows).
   */
  refreshOnGatewayStatusChange?: boolean;
}

export function useLockDeviceRealtime(params: UseLockDeviceRealtimeParams): void {
  const { subscribe, unsubscribe, isConnected } = useWebSocket();
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDebounce = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const scheduleDebouncedRefresh = useCallback((rawPayload: unknown) => {
    const p = paramsRef.current;
    if (!p.debouncedRefresh) return;
    const filter = p.debounceRefreshFilter;
    if (filter && !filter(rawPayload)) return;
    const ms = p.debounceMs ?? 450;
    clearDebounce();
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      p.debouncedRefresh?.();
    }, ms);
  }, [clearDebounce]);

  const onDeviceStatusMessage = useCallback(
    (wrapped: unknown) => {
      const rows = normalizeDeviceStatusWsPayload(wrapped);
      const p = paramsRef.current;
      const targetId = p.deviceId;
      const toEmit =
        targetId != null && targetId !== ''
          ? rows.filter((r) => r.device_id === targetId)
          : rows;
      if (toEmit.length > 0 && p.onDeviceRows) {
        p.onDeviceRows(toEmit);
      }
      scheduleDebouncedRefresh(wrapped);
    },
    [scheduleDebouncedRefresh],
  );

  const onGatewayStatusMessage = useCallback(
    (wrapped: unknown) => {
      const p = paramsRef.current;
      if (p.refreshOnGatewayStatusChange === false) return;

      const payload =
        wrapped && typeof wrapped === 'object' && 'data' in wrapped
          ? (wrapped as { data?: { gateways?: Array<{ facilityId?: string; facility_id?: string }> } }).data
          : undefined;
      const gateways = payload?.gateways;
      const facilityFilter = p.facilityId;

      if (facilityFilter && Array.isArray(gateways)) {
        const affectsFacility = gateways.some((g) => {
          const fid = g.facilityId ?? g.facility_id;
          return fid === facilityFilter;
        });
        if (!affectsFacility) return;
      }

      scheduleDebouncedRefresh(wrapped);
    },
    [scheduleDebouncedRefresh],
  );

  useEffect(() => {
    if (params.enabled === false) return;
    if (!isConnected) return;

    const p = paramsRef.current;
    const wantsRefresh = p.debouncedRefresh != null;

    const needDeviceStatusSub =
      p.onDeviceRows != null ||
      (p.deviceId != null && p.deviceId !== '') ||
      (p.facilityId != null && p.facilityId !== '') ||
      (wantsRefresh && p.subscribeDeviceStatusForRefresh !== false);

    const needUnitsSub = wantsRefresh && p.subscribeUnitsForRefresh !== false;

    const needGatewayStatusSub =
      p.refreshOnGatewayStatusChange !== false &&
      p.facilityId != null &&
      p.facilityId !== '' &&
      (wantsRefresh || p.onDeviceRows != null);

    const subscriptionIds: string[] = [];

    if (needDeviceStatusSub) {
      const filters =
        p.deviceId != null && p.deviceId !== ''
          ? { device_id: p.deviceId }
          : p.facilityId != null && p.facilityId !== ''
            ? { facility_id: p.facilityId }
            : undefined;
      subscriptionIds.push(subscribe('device_status', onDeviceStatusMessage, undefined, filters));
    }

    if (needUnitsSub) {
      subscriptionIds.push(
        subscribe('units', () => scheduleDebouncedRefresh({ source: 'units_update' }), undefined),
      );
    }

    if (needGatewayStatusSub) {
      subscriptionIds.push(
        subscribe('gateway_status', onGatewayStatusMessage, undefined),
      );
    }

    return () => {
      clearDebounce();
      subscriptionIds.forEach((id) => unsubscribe(id));
    };
    // Note: do not list params.debouncedRefresh — parents often pass inline `() => ref.current()`
    // which would re-run this effect every render and spam subscribe/unsubscribe.
  }, [
    params.enabled,
    params.deviceId,
    params.facilityId,
    params.subscribeUnitsForRefresh,
    params.subscribeDeviceStatusForRefresh,
    params.refreshOnGatewayStatusChange,
    isConnected,
    subscribe,
    unsubscribe,
    onDeviceStatusMessage,
    onGatewayStatusMessage,
    scheduleDebouncedRefresh,
    clearDebounce,
  ]);
}
