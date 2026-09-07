import { useEffect, useRef } from 'react';
import type { ConnectionStatus, GatewayInstanceState } from '@protocol/ipc-channels';
import { useToast } from '../contexts/ToastContext';
import { isExpectedConnectionWarning } from '../utils/connection-warning.utils';

type GatewaySnapshot = {
  status: ConnectionStatus;
  connectionWarning?: string;
};

type Options = {
  hydrated: boolean;
  /** When false, status changes are tracked silently (e.g. during bulk connect). */
  notify?: boolean;
};

function syncSnapshots(
  instances: GatewayInstanceState[],
  target: Map<string, GatewaySnapshot>,
): void {
  const ids = new Set(instances.map((g) => g.id));
  for (const id of target.keys()) {
    if (!ids.has(id)) target.delete(id);
  }
  for (const gateway of instances) {
    target.set(gateway.id, {
      status: gateway.connectionStatus,
      connectionWarning: gateway.connectionWarning,
    });
  }
}

export function useGatewayConnectionToasts(instances: GatewayInstanceState[], options: Options) {
  const toast = useToast();
  const prevRef = useRef<Map<string, GatewaySnapshot>>(new Map());
  const seededRef = useRef(false);

  useEffect(() => {
    if (!options.hydrated) return;

    const notify = options.notify !== false;

    if (!seededRef.current) {
      syncSnapshots(instances, prevRef.current);
      seededRef.current = true;
      return;
    }

    if (!notify) {
      syncSnapshots(instances, prevRef.current);
      return;
    }

    for (const gateway of instances) {
      const prev = prevRef.current.get(gateway.id);
      const prevStatus = prev?.status;
      const prevWarning = prev?.connectionWarning;

      if (prevStatus !== gateway.connectionStatus) {
        if (gateway.connectionStatus === 'connected' && prevStatus !== 'connected') {
          toast.success(`${gateway.label} connected`, undefined, {
            dedupeKey: `gateway-status:${gateway.id}:connected`,
          });
        } else if (gateway.connectionStatus === 'error' && prevStatus !== 'error') {
          toast.error(`${gateway.label} connection failed`, gateway.lastError, {
            dedupeKey: `gateway-status:${gateway.id}:error`,
          });
        } else if (
          gateway.connectionStatus === 'disconnected' &&
          prevStatus === 'connected' &&
          gateway.reconnectAt
        ) {
          toast.warning(`${gateway.label} disconnected`, 'Attempting to reconnect…', {
            dedupeKey: `gateway-status:${gateway.id}:disconnected`,
          });
        }
      }

      if (
        gateway.connectionStatus === 'connected' &&
        gateway.connectionWarning &&
        gateway.connectionWarning !== prevWarning &&
        !isExpectedConnectionWarning(gateway)
      ) {
        toast.push({
          type: 'warning',
          title: gateway.sessionRole === 'swap_candidate'
            ? `${gateway.label}: cloud sync blocked`
            : `${gateway.label}: cloud sync deferred`,
          message: gateway.connectionWarning,
          dedupeKey: `warning:${gateway.id}`,
        });
      }
    }

    syncSnapshots(instances, prevRef.current);
  }, [instances, options.hydrated, options.notify, toast]);
}
