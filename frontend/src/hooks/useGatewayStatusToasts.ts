import { useEffect, useRef } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useToast } from '@/contexts/ToastContext';
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
 * Gateway connectivity toasts. Backend product liveness already absorbs brief
 * `/ws/gateway` drops (Cloud Run recycle) via the shared offline grace window;
 * this hook toasts when the broadcast reports a confirmed offline transition.
 */
export function useGatewayStatusToasts(): void {
  const ws = useWebSocket();
  const { addToast } = useToast();
  const lastEffectiveRef = useRef<Record<string, GatewayOperationalStatus>>({});
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
              confirmedOfflineRef.current.add(row.id);
              addToast({
                type: 'error',
                title: `${label} is offline`,
                message: 'Gateway connection lost.',
              });
              return;
            }

            if (effective === 'online' && confirmedOfflineRef.current.has(row.id)) {
              confirmedOfflineRef.current.delete(row.id);
              addToast({
                type: 'success',
                title: `${label} is back online`,
              });
            }
          });
        } catch (error) {
          console.error('Failed to process gateway status update', error);
        }
      },
    );

    return () => {
      if (subscriptionId) {
        ws.unsubscribe(subscriptionId);
      }
    };
  }, [ws, addToast]);
}
