import { useEffect, useRef } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { websocketService } from '@/services/websocket.service';

/** How long live updates may be down before we notify the operator. */
export const LIVE_DATA_OUTAGE_TOAST_MS = 10_000;

function hasSessionToken(): boolean {
  return Boolean(localStorage.getItem('authToken'));
}

/**
 * Toast when dashboard `/ws` live data is unavailable for >10s, and when it resumes
 * after a confirmed outage. Transient blips under the grace window stay silent.
 * Logout, 401 session clear, and intentional disconnects never toast.
 */
export function useLiveDataToasts(): void {
  const { isConnected } = useWebSocket();
  const { addToast } = useToast();
  const { authState } = useAuth();
  const hadLiveDataRef = useRef(false);
  const announcedOutageRef = useRef(false);
  const outageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLiveSessionRef = useRef(false);

  const isLiveSession = authState.isAuthenticated && !authState.isLoading;
  isLiveSessionRef.current = isLiveSession;

  const clearOutageTimer = () => {
    if (outageTimerRef.current) {
      clearTimeout(outageTimerRef.current);
      outageTimerRef.current = null;
    }
  };

  const resetTracking = () => {
    clearOutageTimer();
    hadLiveDataRef.current = false;
    announcedOutageRef.current = false;
  };

  useEffect(() => {
    if (!isLiveSession) {
      resetTracking();
      return;
    }

    if (isConnected) {
      clearOutageTimer();

      if (announcedOutageRef.current) {
        announcedOutageRef.current = false;
        addToast({
          type: 'success',
          title: 'Live updates restored',
          message: 'Realtime facility data is connected again.',
        });
      }

      hadLiveDataRef.current = true;
      return;
    }

    // Intentional teardown (logout / pagehide) or session already cleared — stay silent.
    if (websocketService.isIntentionalDisconnect() || !hasSessionToken()) {
      resetTracking();
      return;
    }

    // Disconnected: only arm the outage toast after we previously had a live session.
    if (!hadLiveDataRef.current) return;
    if (outageTimerRef.current || announcedOutageRef.current) return;

    outageTimerRef.current = setTimeout(() => {
      outageTimerRef.current = null;
      if (announcedOutageRef.current) return;
      if (!isLiveSessionRef.current) return;
      if (!hasSessionToken()) return;
      if (websocketService.isIntentionalDisconnect()) return;
      if (websocketService.isWebSocketConnected()) return;

      announcedOutageRef.current = true;
      addToast({
        type: 'warning',
        title: 'Live updates paused',
        message: 'No realtime connection for over 10 seconds. Reconnecting…',
      });
    }, LIVE_DATA_OUTAGE_TOAST_MS);
  }, [isConnected, isLiveSession, addToast]);

  useEffect(() => () => {
    clearOutageTimer();
  }, []);
}
