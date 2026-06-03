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

  it('refreshes unit data when hardware feedback times out', async () => {
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

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(lockStatus).toBe('unlocking');

    lockStatus = 'locked';

    await act(async () => {
      jest.advanceTimersByTime(LOCK_HARDWARE_FEEDBACK_TIMEOUT_MS);
    });

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'No confirmation yet' }),
    );
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
});
