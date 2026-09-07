import { useEffect, useRef } from 'react';

const DEFAULT_PENDING_POLL_MS = 2_000;

/**
 * While any access session is `pending` (waiting for unlock), poll REST.
 * Gateway lock-state is applied on the Cloud Run instance that holds `/ws/gateway`;
 * dashboard/`/ws/app` subscribers on another instance never see the in-memory
 * upsert. A short poll heals that gap — a full refresh already shows the truth.
 */
export function usePendingSessionPoll(
  hasPendingSession: boolean,
  refresh: (options?: { background?: boolean }) => void | Promise<void>,
  intervalMs: number = DEFAULT_PENDING_POLL_MS,
): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!hasPendingSession || intervalMs <= 0) return;
    const timer = setInterval(() => {
      void refreshRef.current({ background: true });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [hasPendingSession, intervalMs]);
}
