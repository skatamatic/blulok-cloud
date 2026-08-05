import { useCallback, useRef } from 'react';
import { AccessLog } from '@/types/access-history.types';
import { useWebSocketSubscription } from '@/hooks/useWebSocketSubscription';
import {
  AccessHistoryLiveFilters,
  accessLogFromActivityWsData,
  matchesAccessHistoryLiveFilters,
  parseActivityWsEnvelope,
  prependUniqueAccessLog,
} from '@/utils/access-history-live.utils';

export type UseAccessHistoryLiveUpdatesOptions = {
  enabled: boolean;
  /** Server-side activity subscription filters (facility / unit). */
  subscriptionFilters?: Record<string, unknown>;
  /** Client-side row filters applied after WS parse. */
  liveFilters: AccessHistoryLiveFilters;
  maxRows: number;
  /**
   * When true, prepend matching rows into local state.
   * When false, call onFallbackRefresh instead (e.g. non-default sort/page).
   */
  canPrepend: boolean;
  onPrepend: (updater: (prev: AccessLog[]) => AccessLog[]) => void;
  /** Invoked when a matching row is prepended (e.g. bump total count). */
  onPrepended?: () => void;
  onFallbackRefresh: (options?: { background?: boolean }) => void | Promise<void>;
};

/**
 * Shared Access History / widget live activity feed:
 * parse WS envelope → filter → prepend or background refresh.
 */
export function useAccessHistoryLiveUpdates(options: UseAccessHistoryLiveUpdatesOptions): void {
  const {
    enabled,
    subscriptionFilters,
    liveFilters,
    maxRows,
    canPrepend,
    onPrepend,
    onPrepended,
    onFallbackRefresh,
  } = options;

  const refreshRef = useRef(onFallbackRefresh);
  refreshRef.current = onFallbackRefresh;
  const onPrependedRef = useRef(onPrepended);
  onPrependedRef.current = onPrepended;

  const handleActivityWs = useCallback(
    (data: unknown) => {
      const { eventType, payload } = parseActivityWsEnvelope(data);
      if (eventType === 'activity_update') {
        return;
      }

      const incoming = accessLogFromActivityWsData(payload);
      if (!incoming) {
        void refreshRef.current({ background: true });
        return;
      }

      if (!matchesAccessHistoryLiveFilters(incoming, liveFilters)) {
        return;
      }

      if (canPrepend) {
        onPrepend((prev) => {
          const next = prependUniqueAccessLog(prev, incoming, maxRows);
          if (next !== prev) {
            onPrependedRef.current?.();
          }
          return next;
        });
        return;
      }

      void refreshRef.current({ background: true });
    },
    [canPrepend, liveFilters, maxRows, onPrepend],
  );

  useWebSocketSubscription('activity', handleActivityWs, {
    filters: subscriptionFilters,
    enabled,
  });
}
