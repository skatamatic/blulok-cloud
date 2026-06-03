import { useCallback, useRef, useState } from 'react';
import { useToast } from '@/contexts/ToastContext';
import { apiService } from '@/services/api.service';
import { getApiErrorMessage } from '@/utils/apiError.utils';
import {
  lockHardwareFeedbackToasts,
  type LockHardwareFeedbackToast,
} from '@/utils/lockHardwareFeedback.constants';
import {
  useLockHardwareFeedback,
  type UseLockHardwareFeedbackOptions,
} from '@/hooks/useLockHardwareFeedback';
import { canRequestRemoteUnlock } from '@/utils/unitLock.utils';
import { resolveLockCommandTimeoutMs } from '@/utils/facilityLockTimeout.utils';

export type RemoteUnlockRequest = {
  deviceId: string;
  /** Used to cancel the hardware-ack watch when status settles. */
  watchKey: string;
  getLockStatus: () => string | undefined;
  applyOptimisticUnlocking: () => void;
  /** Reset transitional UI when unlock stalls or fails. */
  revertOptimisticLockStatus?: (previousStatus: string) => void;
  /** Facility-specific hardware-ack timeout (ms). Defaults to 10s. */
  timeoutMs?: number;
  /** Override default BluLok unlock API (e.g. access-control devices). */
  sendUnlockCommand?: (deviceId: string) => Promise<unknown>;
  refresh?: () => Promise<void>;
};

export type UseRemoteUnlockActionOptions = UseLockHardwareFeedbackOptions & {
  errorToast?: () => LockHardwareFeedbackToast;
};

/**
 * Shared remote-unlock flow: optimistic `unlocking`, hardware-ack watch, toasts, and refresh.
 * Matches DeviceDetailsPage / UnitDetailsPage timeout and feedback behavior.
 */
export function useRemoteUnlockAction(options?: UseRemoteUnlockActionOptions) {
  const { addToast } = useToast();
  const { scheduleUnlockWatch, cancelWatch } = useLockHardwareFeedback(options);
  const pendingRef = useRef(false);
  const watchGetStatusRef = useRef<(() => string | undefined) | null>(null);
  const [activeWatchKey, setActiveWatchKey] = useState<string | null>(null);
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const errorToast =
    options?.errorToast ?? lockHardwareFeedbackToasts.couldNotUnlockUnit;

  const clearWatch = useCallback(() => {
    pendingRef.current = false;
    watchGetStatusRef.current = null;
    setActiveWatchKey(null);
    cancelWatch();
  }, [cancelWatch]);

  const requestUnlock = useCallback(
    async ({
      deviceId,
      watchKey,
      getLockStatus,
      applyOptimisticUnlocking,
      revertOptimisticLockStatus,
      timeoutMs,
      sendUnlockCommand,
      refresh,
    }: RemoteUnlockRequest) => {
      if (!canRequestRemoteUnlock(getLockStatus())) return;

      const previousStatus = getLockStatus() ?? 'locked';
      const feedbackTimeoutMs = timeoutMs ?? resolveLockCommandTimeoutMs();

      setSubmittingKey(watchKey);
      pendingRef.current = true;
      watchGetStatusRef.current = getLockStatus;
      setActiveWatchKey(watchKey);

      scheduleUnlockWatch(
        getLockStatus,
        () => {
          revertOptimisticLockStatus?.(previousStatus);
          clearWatch();
          void refresh?.();
        },
        feedbackTimeoutMs,
      );

      applyOptimisticUnlocking();

      try {
        const unlock = sendUnlockCommand ?? ((id: string) => apiService.updateLockStatus(id, 'unlocked'));
        await unlock(deviceId);
        addToast(lockHardwareFeedbackToasts.unlockCommandSent());
        await refresh?.();
      } catch (error: unknown) {
        revertOptimisticLockStatus?.(previousStatus);
        clearWatch();
        addToast({
          ...errorToast(),
          message: getApiErrorMessage(error, 'Try again in a moment.'),
        });
        await refresh?.();
      } finally {
        setSubmittingKey(null);
      }
    },
    [addToast, clearWatch, errorToast, scheduleUnlockWatch],
  );

  /** Call when lock status may have changed (e.g. after list refresh). */
  const syncLockStatus = useCallback(
    (watchKey: string, lockStatus: string | undefined) => {
      if (!pendingRef.current || activeWatchKey !== watchKey) return;
      if (lockStatus === 'unlocked' || lockStatus === 'locked') {
        clearWatch();
      }
    },
    [activeWatchKey, clearWatch],
  );

  return {
    requestUnlock,
    syncLockStatus,
    submittingKey,
    isSubmitting: (key: string | null | undefined) => Boolean(key) && submittingKey === key,
    cancelWatch: clearWatch,
  };
}
