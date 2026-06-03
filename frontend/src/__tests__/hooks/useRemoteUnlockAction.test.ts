/**
 * @jest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { useRemoteUnlockAction } from '@/hooks/useRemoteUnlockAction';
import { LOCK_HARDWARE_FEEDBACK_TIMEOUT_MS } from '@/utils/lockHardwareFeedback.utils';

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
      jest.advanceTimersByTime(LOCK_HARDWARE_FEEDBACK_TIMEOUT_MS);
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
      jest.advanceTimersByTime(LOCK_HARDWARE_FEEDBACK_TIMEOUT_MS);
    });

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
      jest.advanceTimersByTime(LOCK_HARDWARE_FEEDBACK_TIMEOUT_MS);
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(mockAddToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'No confirmation yet' }),
    );
  });
});
