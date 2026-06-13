import { useEffect, useRef } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useToast } from '@/contexts/ToastContext';
import { GATEWAY_OFFLINE_TOAST_GRACE_MS } from '@/constants/gateway-liveness.constants';
import {
  resolveEffectiveGatewayStatus,
  type GatewayOperationalStatus,
} from '@/utils/facility-gateway-live-status.utils';

type GatewayStatusRow = {
  id: string;
  name?: string;
  status: GatewayOperationalStatus;
  connected?: boolean | null;
};

/**
 * Debounced gateway connectivity toasts. Transient WS drops (common on Cloud Run) should
 * not spam "offline" toasts when the gateway reconnects within the grace window.
 */
export function useGatewayStatusToasts(): void {
  const ws = useWebSocket();
  const { addToast } = useToast();
  const lastEffectiveRef = useRef<Record<string, GatewayOperationalStatus>>({});
  const pendingOfflineRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const confirmedOfflineRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const subscriptionId = ws.subscribe(
      'gateway_status',
      (data: unknown) => {
        try {
          const gateways = (data as { gateways?: GatewayStatusRow[] })?.gateways ?? [];
          gateways.forEach((row) => {
            const effective = resolveEffectiveGatewayStatus({
              dbStatus: row.status,
              connected: row.connected ?? null,
            });
            const prev = lastEffectiveRef.current[row.id];
            lastEffectiveRef.current[row.id] = effective;

            if (!prev || prev === effective) {
              return;
            }

            const label = row.name?.trim() || 'Facility gateway';

            if (effective === 'offline') {
              if (pendingOfflineRef.current[row.id]) {
                return;
              }
              pendingOfflineRef.current[row.id] = setTimeout(() => {
                delete pendingOfflineRef.current[row.id];
                confirmedOfflineRef.current.add(row.id);
                addToast({
                  type: 'error',
                  title: `${label} is offline`,
                  message: 'No gateway connection for over a minute.',
                });
              }, GATEWAY_OFFLINE_TOAST_GRACE_MS);
              return;
            }

            if (effective === 'online') {
              if (pendingOfflineRef.current[row.id]) {
                clearTimeout(pendingOfflineRef.current[row.id]);
                delete pendingOfflineRef.current[row.id];
                return;
              }
              if (confirmedOfflineRef.current.has(row.id)) {
                confirmedOfflineRef.current.delete(row.id);
                addToast({
                  type: 'success',
                  title: `${label} is back online`,
                });
              }
            }
          });
        } catch (error) {
          console.error('Failed to process gateway status update', error);
        }
      },
    );

    return () => {
      Object.values(pendingOfflineRef.current).forEach(clearTimeout);
      pendingOfflineRef.current = {};
      if (subscriptionId) {
        ws.unsubscribe(subscriptionId);
      }
    };
  }, [ws, addToast]);
}
