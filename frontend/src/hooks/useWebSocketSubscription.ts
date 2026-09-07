import { useEffect, useRef } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';

export interface UseWebSocketSubscriptionOptions {
  enabled?: boolean;
  filters?: Record<string, unknown>;
  onError?: (error: string) => void;
}

/**
 * Subscribe for the lifetime of a component. Survives disconnect/reconnect without
 * tearing down server subscription intent (unsubscribe only on unmount or filter change).
 */
export function useWebSocketSubscription<T = unknown>(
  type: string,
  onMessage: (data: T) => void,
  options?: UseWebSocketSubscriptionOptions,
): void {
  const { subscribe, unsubscribe } = useWebSocket();
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(options?.onError);
  onMessageRef.current = onMessage;
  onErrorRef.current = options?.onError;

  const filtersKey = options?.filters ? JSON.stringify(options.filters) : '';

  useEffect(() => {
    if (options?.enabled === false) return;

    const subscriptionId = subscribe(
      type,
      (data) => onMessageRef.current(data as T),
      onErrorRef.current ? (error) => onErrorRef.current?.(error) : undefined,
      options?.filters,
    );

    return () => unsubscribe(subscriptionId);
  }, [subscribe, unsubscribe, type, filtersKey, options?.enabled]);
}
