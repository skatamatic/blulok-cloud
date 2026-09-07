import { useCallback, useRef } from 'react';
import { AccessLog } from '@/types/access-history.types';
import { AccessSession } from '@/types/access-session.types';
import { useWebSocketSubscription } from '@/hooks/useWebSocketSubscription';
import {
  AccessHistoryLiveFilters,
  accessLogFromActivityWsData,
  accessSessionFromWsData,
  matchesAccessHistoryLiveFilters,
  matchesAccessSessionLiveFilters,
  parseActivityWsEnvelope,
  prependUniqueAccessLog,
  upsertAccessSession,
} from '@/utils/access-history-live.utils';

export type UseAccessHistoryLiveUpdatesOptions = {
  enabled: boolean;
  /** Server-side activity subscription filters (facility / unit). */
  subscriptionFilters?: Record<string, unknown>;
  /** Client-side row filters applied after WS parse. */
  liveFilters: AccessHistoryLiveFilters;
  maxRows: number;
  /**
   * When true, prepend matching raw rows into local state.
   * When false, call onFallbackRefresh instead (e.g. non-default sort/page).
   */
  canPrepend?: boolean;
  onPrepend?: (updater: (prev: AccessLog[]) => AccessLog[]) => void;
  /** Invoked when a matching raw row is prepended (e.g. bump total count). */
  onPrepended?: () => void;
  /** Optional session upsert path (Access History sessions view / widget). */
  canUpsertSessions?: boolean;
  onSessionUpsert?: (updater: (prev: AccessSession[]) => AccessSession[]) => void;
  /** Invoked when a matching session is newly prepended (not an in-place replace). */
  onSessionUpserted?: () => void;
  onFallbackRefresh: (options?: { background?: boolean }) => void | Promise<void>;
};

/**
 * Shared Access History / widget live activity feed:
 * parse WS envelope → filter → prepend (raw) / upsert (sessions) or background refresh.
 */
export function useAccessHistoryLiveUpdates(options: UseAccessHistoryLiveUpdatesOptions): void {
  const {
    enabled,
    subscriptionFilters,
    liveFilters,
    maxRows,
    canPrepend = false,
    onPrepend,
    onPrepended,
    canUpsertSessions = false,
    onSessionUpsert,
    onSessionUpserted,
    onFallbackRefresh,
  } = options;

  const refreshRef = useRef(onFallbackRefresh);
  refreshRef.current = onFallbackRefresh;
  const onPrependedRef = useRef(onPrepended);
  onPrependedRef.current = onPrepended;
  const onSessionUpsertedRef = useRef(onSessionUpserted);
  onSessionUpsertedRef.current = onSessionUpserted;
  const onSessionUpsertRef = useRef(onSessionUpsert);
  onSessionUpsertRef.current = onSessionUpsert;

  const handleActivityWs = useCallback(
    (data: unknown) => {
      const { eventType, payload } = parseActivityWsEnvelope(data);
      if (eventType === 'activity_update') {
        return;
      }

      if (eventType === 'access_session_upsert') {
        const incoming = accessSessionFromWsData(payload);
        if (!incoming) {
          void refreshRef.current({ background: true });
          return;
        }
        if (!matchesAccessSessionLiveFilters(incoming, liveFilters)) {
          return;
        }
        if (canUpsertSessions && onSessionUpsertRef.current) {
          onSessionUpsertRef.current((prev) => {
            const existed = prev.some((row) => row.id === incoming.id);
            const next = upsertAccessSession(prev, incoming, maxRows);
            if (!existed && next !== prev) {
              onSessionUpsertedRef.current?.();
            }
            return next;
          });
          return;
        }
        void refreshRef.current({ background: true });
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

      if (canPrepend && onPrepend) {
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
    [canPrepend, canUpsertSessions, liveFilters, maxRows, onPrepend],
  );

  useWebSocketSubscription('activity', handleActivityWs, {
    filters: subscriptionFilters,
    enabled,
  });
}
