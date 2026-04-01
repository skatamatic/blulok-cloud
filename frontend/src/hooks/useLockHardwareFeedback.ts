import { useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/contexts/ToastContext';
import { startLockHardwareFeedbackWatch } from '@/utils/lockHardwareFeedback.utils';
import {
  lockHardwareFeedbackToasts,
  type LockHardwareFeedbackToast,
} from '@/utils/lockHardwareFeedback.constants';

export type UseLockHardwareFeedbackOptions = {
  /** Defaults to {@link lockHardwareFeedbackToasts.deviceUnlockTimeout}. */
  timeoutToast?: () => LockHardwareFeedbackToast;
};

/**
 * Schedules a single in-flight hardware-ack watch for remote unlock. Call {@link cancelWatch}
 * when the device reports `unlocked` or on error paths. Cleans up on unmount.
 */
export function useLockHardwareFeedback(options?: UseLockHardwareFeedbackOptions) {
  const { addToast } = useToast();
  const cancelRef = useRef<(() => void) | null>(null);
  const timeoutToast = options?.timeoutToast ?? lockHardwareFeedbackToasts.deviceUnlockTimeout;

  useEffect(() => {
    return () => {
      cancelRef.current?.();
    };
  }, []);

  const scheduleUnlockWatch = useCallback(
    (getLockStatus: () => string | undefined, onTimeoutExtra?: () => void) => {
      cancelRef.current?.();
      cancelRef.current = startLockHardwareFeedbackWatch(
        'unlocked',
        getLockStatus,
        () => {
          addToast(timeoutToast());
          onTimeoutExtra?.();
        },
      );
    },
    [addToast, timeoutToast],
  );

  const cancelWatch = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
  }, []);

  return { scheduleUnlockWatch, cancelWatch };
}
