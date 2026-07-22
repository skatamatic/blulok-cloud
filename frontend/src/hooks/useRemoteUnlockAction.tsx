import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useToast } from '@/contexts/ToastContext';
import { apiService } from '@/services/api.service';
import { getApiErrorCode, getApiErrorMessage } from '@/utils/apiError.utils';
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
import { TenantUnlockOverrideDialog } from '@/components/Lock/TenantUnlockOverrideDialog';
import type { TenantUnlockOverridePayload } from '@/constants/tenantUnlockOverride.constants';

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
  sendUnlockCommand?: (
    deviceId: string,
    tenantOverride?: TenantUnlockOverridePayload,
  ) => Promise<unknown>;
  refresh?: () => Promise<void>;
  /**
   * When true, show tenant-override confirmation before sending the unlock command.
   * Backend also enforces this when the unit has a tenant.
   */
  requiresTenantOverride?: boolean;
  /** Optional unit number/label shown in the override dialog. */
  unitLabel?: string;
};

export type UseRemoteUnlockActionOptions = UseLockHardwareFeedbackOptions & {
  errorToast?: () => LockHardwareFeedbackToast;
};

const TENANT_OVERRIDE_REQUIRED_CODE = 'TENANT_UNLOCK_OVERRIDE_REQUIRED';

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
  const [overrideDialog, setOverrideDialog] = useState<{
    request: RemoteUnlockRequest;
    /** Preserve prior notes/reason selection after a failed attempt. */
    draft?: TenantUnlockOverridePayload;
  } | null>(null);
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const errorToast =
    options?.errorToast ?? lockHardwareFeedbackToasts.couldNotUnlockUnit;

  const clearWatch = useCallback(() => {
    pendingRef.current = false;
    watchGetStatusRef.current = null;
    setActiveWatchKey(null);
    cancelWatch();
  }, [cancelWatch]);

  const executeUnlock = useCallback(
    async (
      request: RemoteUnlockRequest,
      tenantOverride?: TenantUnlockOverridePayload,
    ): Promise<'ok' | 'tenant_override_required' | 'error'> => {
      const {
        deviceId,
        watchKey,
        getLockStatus,
        applyOptimisticUnlocking,
        revertOptimisticLockStatus,
        timeoutMs,
        sendUnlockCommand,
        refresh,
      } = request;

      if (!canRequestRemoteUnlock(getLockStatus())) return 'error';

      const previousStatus = getLockStatus() ?? 'locked';
      const feedbackTimeoutMs = timeoutMs ?? resolveLockCommandTimeoutMs();
      const oneShot = feedbackTimeoutMs === 0;

      setSubmittingKey(watchKey);

      if (oneShot) {
        pendingRef.current = false;
        watchGetStatusRef.current = null;
        setActiveWatchKey(null);
      } else {
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
      }

      try {
        const unlock =
          sendUnlockCommand
          ?? ((id: string, override?: TenantUnlockOverridePayload) =>
            apiService.updateLockStatus(id, 'unlocked', override));
        await unlock(deviceId, tenantOverride);
        addToast(lockHardwareFeedbackToasts.unlockCommandSent());
        await refresh?.();
        return 'ok';
      } catch (error: unknown) {
        if (!oneShot) {
          revertOptimisticLockStatus?.(previousStatus);
          clearWatch();
        }
        const code = getApiErrorCode(error);
        if (code === TENANT_OVERRIDE_REQUIRED_CODE) {
          await refresh?.();
          return 'tenant_override_required';
        }
        addToast({
          ...errorToast(),
          message: getApiErrorMessage(error, 'Try again in a moment.'),
        });
        await refresh?.();
        return 'error';
      } finally {
        setSubmittingKey(null);
      }
    },
    [addToast, clearWatch, errorToast, scheduleUnlockWatch],
  );

  const requestUnlock = useCallback(
    async (request: RemoteUnlockRequest) => {
      if (!canRequestRemoteUnlock(request.getLockStatus())) return;

      if (request.requiresTenantOverride) {
        setOverrideDialog({ request });
        return;
      }

      const result = await executeUnlock(request);
      if (result === 'tenant_override_required') {
        setOverrideDialog({ request });
      }
    },
    [executeUnlock],
  );

  const cancelTenantOverride = useCallback(() => {
    if (overrideSubmitting) return;
    setOverrideDialog(null);
  }, [overrideSubmitting]);

  const confirmTenantOverride = useCallback(
    async (payload: TenantUnlockOverridePayload) => {
      const pending = overrideDialog;
      if (!pending) return;
      setOverrideSubmitting(true);
      try {
        const result = await executeUnlock(pending.request, payload);
        if (result === 'ok') {
          setOverrideDialog(null);
          return;
        }
        // Keep dialog open with the user's draft so they can retry / adjust.
        setOverrideDialog({
          request: pending.request,
          draft: payload,
        });
        if (result === 'error') {
          // Toast already shown by executeUnlock
        }
      } finally {
        setOverrideSubmitting(false);
      }
    },
    [executeUnlock, overrideDialog],
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

  const overrideUnitLabel = overrideDialog ? overrideDialog.request.unitLabel : undefined;
  const overrideDraft = overrideDialog ? overrideDialog.draft : undefined;

  const tenantOverrideDialog: ReactNode = (
    <TenantUnlockOverrideDialog
      isOpen={Boolean(overrideDialog)}
      isLoading={overrideSubmitting}
      unitLabel={overrideUnitLabel}
      initialDraft={overrideDraft}
      onCancel={cancelTenantOverride}
      onConfirm={(payload) => {
        void confirmTenantOverride(payload);
      }}
    />
  );

  return {
    requestUnlock,
    syncLockStatus,
    submittingKey,
    isSubmitting: (key: string | null | undefined) => Boolean(key) && submittingKey === key,
    cancelWatch: clearWatch,
    /** Render once near the page/widget root so the override dialog can open. */
    tenantOverrideDialog,
  };
}
