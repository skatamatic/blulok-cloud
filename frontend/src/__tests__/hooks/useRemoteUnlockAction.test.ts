/**
 * @jest-environment jsdom
 */
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { useRemoteUnlockAction } from '@/hooks/useRemoteUnlockAction';
import { resolveLockCommandTimeoutMs } from '@/utils/facilityLockTimeout.utils';
import type { TenantUnlockOverridePayload } from '@/constants/tenantUnlockOverride.constants';

const mockAddToast = jest.fn();
const mockUpdateLockStatus = jest.fn();

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

jest.mock('@/services/api.service', () => ({
  apiService: {
    updateLockStatus: (...args: unknown[]) => mockUpdateLockStatus(...args),
  },
}));

jest.mock('@/components/Lock/TenantUnlockOverrideDialog', () => ({
  TenantUnlockOverrideDialog: () => null,
}));

type DialogProps = {
  isOpen?: boolean;
  isLoading?: boolean;
  initialDraft?: TenantUnlockOverridePayload;
  onConfirm?: (payload: TenantUnlockOverridePayload) => void;
  onCancel?: () => void;
};

function dialogProps(node: ReactNode): DialogProps | null {
  if (!isValidElement(node)) return null;
  return (node as ReactElement<DialogProps>).props;
}

describe('useRemoteUnlockAction', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockUpdateLockStatus.mockResolvedValue({ lock_status: 'unlocking' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('refreshes unit data and reverts optimistic state when hardware feedback times out', async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    const revertOptimisticLockStatus = jest.fn();
    let lockStatus = 'locked';

    const { result } = renderHook(() => useRemoteUnlockAction());

    await act(async () => {
      await result.current.requestUnlock({
        deviceId: 'dev-1',
        watchKey: 'unit-1',
        getLockStatus: () => lockStatus,
        applyOptimisticUnlocking: () => {
          lockStatus = 'unlocking';
        },
        revertOptimisticLockStatus,
        refresh,
      });
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(lockStatus).toBe('unlocking');

    await act(async () => {
      jest.advanceTimersByTime(resolveLockCommandTimeoutMs());
    });

    expect(revertOptimisticLockStatus).toHaveBeenCalledWith('locked');
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'No confirmation yet' }),
    );
  });

  it('reverts optimistic state when the unlock API fails', async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    const revertOptimisticLockStatus = jest.fn();
    let lockStatus = 'locked';
    mockUpdateLockStatus.mockRejectedValueOnce(new Error('gateway offline'));

    const { result } = renderHook(() => useRemoteUnlockAction());

    await act(async () => {
      await result.current.requestUnlock({
        deviceId: 'dev-1',
        watchKey: 'unit-1',
        getLockStatus: () => lockStatus,
        applyOptimisticUnlocking: () => {
          lockStatus = 'unlocking';
        },
        revertOptimisticLockStatus,
        refresh,
      });
    });

    expect(revertOptimisticLockStatus).toHaveBeenCalledWith('locked');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not refresh again on timeout when unlock already confirmed', async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    let lockStatus = 'locked';

    const { result } = renderHook(() => useRemoteUnlockAction());

    await act(async () => {
      await result.current.requestUnlock({
        deviceId: 'dev-1',
        watchKey: 'unit-1',
        getLockStatus: () => lockStatus,
        applyOptimisticUnlocking: () => {
          lockStatus = 'unlocking';
        },
        refresh,
      });
    });

    lockStatus = 'unlocked';

    await act(async () => {
      result.current.syncLockStatus('unit-1', 'unlocked');
      jest.advanceTimersByTime(resolveLockCommandTimeoutMs());
    });

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not apply optimistic unlocking or schedule watch when timeout is 0', async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    const revertOptimisticLockStatus = jest.fn();
    let lockStatus = 'locked';

    const { result } = renderHook(() => useRemoteUnlockAction());

    await act(async () => {
      await result.current.requestUnlock({
        deviceId: 'dev-1',
        watchKey: 'unit-1',
        getLockStatus: () => lockStatus,
        applyOptimisticUnlocking: () => {
          lockStatus = 'unlocking';
        },
        revertOptimisticLockStatus,
        refresh,
        timeoutMs: 0,
      });
    });

    expect(lockStatus).toBe('locked');
    expect(revertOptimisticLockStatus).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(resolveLockCommandTimeoutMs());
    });

    expect(revertOptimisticLockStatus).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('clears the watch when status returns to locked during a pending unlock', async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    let lockStatus = 'locked';

    const { result } = renderHook(() => useRemoteUnlockAction());

    await act(async () => {
      await result.current.requestUnlock({
        deviceId: 'dev-1',
        watchKey: 'unit-1',
        getLockStatus: () => lockStatus,
        applyOptimisticUnlocking: () => {
          lockStatus = 'unlocking';
        },
        refresh,
      });
    });

    lockStatus = 'locked';

    await act(async () => {
      result.current.syncLockStatus('unit-1', 'locked');
      jest.advanceTimersByTime(resolveLockCommandTimeoutMs());
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(mockAddToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'No confirmation yet' }),
    );
  });

  it('does not call the unlock API until tenant override is confirmed', async () => {
    const { result } = renderHook(() => useRemoteUnlockAction());

    await act(async () => {
      await result.current.requestUnlock({
        deviceId: 'dev-1',
        watchKey: 'unit-1',
        getLockStatus: () => 'locked',
        applyOptimisticUnlocking: jest.fn(),
        requiresTenantOverride: true,
        unitLabel: 'A-101',
      });
    });

    expect(mockUpdateLockStatus).not.toHaveBeenCalled();
    expect(dialogProps(result.current.tenantOverrideDialog)?.isOpen).toBe(true);
  });

  it('opens override dialog when API returns TENANT_UNLOCK_OVERRIDE_REQUIRED', async () => {
    mockUpdateLockStatus.mockRejectedValueOnce({
      response: {
        data: {
          code: 'TENANT_UNLOCK_OVERRIDE_REQUIRED',
          message: 'This unit has a tenant. Select a reason before unlocking remotely.',
        },
      },
    });

    const { result } = renderHook(() => useRemoteUnlockAction());

    await act(async () => {
      await result.current.requestUnlock({
        deviceId: 'dev-1',
        watchKey: 'unit-1',
        getLockStatus: () => 'locked',
        applyOptimisticUnlocking: jest.fn(),
        requiresTenantOverride: false,
        timeoutMs: 0,
      });
    });

    expect(dialogProps(result.current.tenantOverrideDialog)?.isOpen).toBe(true);
  });

  it('keeps override dialog open with draft when unlock fails after confirm', async () => {
    const sendUnlockCommand = jest
      .fn()
      .mockRejectedValueOnce(new Error('gateway offline'));

    const { result } = renderHook(() => useRemoteUnlockAction());

    await act(async () => {
      await result.current.requestUnlock({
        deviceId: 'dev-1',
        watchKey: 'unit-1',
        getLockStatus: () => 'locked',
        applyOptimisticUnlocking: jest.fn(),
        requiresTenantOverride: true,
        sendUnlockCommand,
        timeoutMs: 0,
      });
    });

    expect(dialogProps(result.current.tenantOverrideDialog)?.isOpen).toBe(true);
    expect(sendUnlockCommand).not.toHaveBeenCalled();

    await act(async () => {
      dialogProps(result.current.tenantOverrideDialog)?.onConfirm?.({
        reason: 'emergency',
        notes: 'Retry later',
      });
    });

    expect(sendUnlockCommand).toHaveBeenCalledWith('dev-1', {
      reason: 'emergency',
      notes: 'Retry later',
    });
    expect(dialogProps(result.current.tenantOverrideDialog)?.isOpen).toBe(true);
    expect(dialogProps(result.current.tenantOverrideDialog)?.initialDraft).toEqual({
      reason: 'emergency',
      notes: 'Retry later',
    });
  });

  it('closes override dialog after successful unlock with override', async () => {
    const sendUnlockCommand = jest.fn().mockResolvedValueOnce({ lock_status: 'unlocking' });

    const { result } = renderHook(() => useRemoteUnlockAction());

    await act(async () => {
      await result.current.requestUnlock({
        deviceId: 'dev-1',
        watchKey: 'unit-1',
        getLockStatus: () => 'locked',
        applyOptimisticUnlocking: jest.fn(),
        requiresTenantOverride: true,
        sendUnlockCommand,
        timeoutMs: 0,
      });
    });

    await act(async () => {
      dialogProps(result.current.tenantOverrideDialog)?.onConfirm?.({
        reason: 'testing_maintenance',
      });
    });

    expect(sendUnlockCommand).toHaveBeenCalled();
    expect(dialogProps(result.current.tenantOverrideDialog)?.isOpen).toBe(false);
  });
});
