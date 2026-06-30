import {
  isLockFeedbackStuck,
  startHardwareAckWatch,
  LOCK_HARDWARE_FEEDBACK_TIMEOUT_MS,
} from '@/utils/lockHardwareFeedback.utils';

describe('isLockFeedbackStuck', () => {
  it('detects stuck paths for unlock target', () => {
    expect(isLockFeedbackStuck('unlocked', 'unlocked')).toBe(false);
    expect(isLockFeedbackStuck('unlocked', 'unlocking')).toBe(true);
    expect(isLockFeedbackStuck('unlocked', 'locked')).toBe(true);
    expect(isLockFeedbackStuck('unlocked', 'locking')).toBe(true);
    expect(isLockFeedbackStuck('unlocked', 'error')).toBe(true);
    expect(isLockFeedbackStuck('unlocked', 'maintenance')).toBe(true);
  });

  it('detects stuck paths for lock target', () => {
    expect(isLockFeedbackStuck('locked', 'locked')).toBe(false);
    expect(isLockFeedbackStuck('locked', 'locking')).toBe(true);
    expect(isLockFeedbackStuck('locked', 'unlocked')).toBe(true);
    expect(isLockFeedbackStuck('locked', 'error')).toBe(true);
  });
});

describe('startHardwareAckWatch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('fires onTimedOut when still pending', () => {
    const onTimedOut = jest.fn();
    startHardwareAckWatch(() => true, onTimedOut, LOCK_HARDWARE_FEEDBACK_TIMEOUT_MS);
    jest.advanceTimersByTime(LOCK_HARDWARE_FEEDBACK_TIMEOUT_MS);
    expect(onTimedOut).toHaveBeenCalledTimes(1);
  });

  it('does not fire when cancel is called', () => {
    const onTimedOut = jest.fn();
    const cancel = startHardwareAckWatch(() => true, onTimedOut, LOCK_HARDWARE_FEEDBACK_TIMEOUT_MS);
    cancel();
    jest.advanceTimersByTime(LOCK_HARDWARE_FEEDBACK_TIMEOUT_MS);
    expect(onTimedOut).not.toHaveBeenCalled();
  });
});
