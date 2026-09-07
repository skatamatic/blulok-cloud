/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { usePendingSessionPoll } from '@/hooks/usePendingSessionPoll';

describe('usePendingSessionPoll', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not poll when no session is pending', () => {
    const refresh = jest.fn();
    renderHook(() => usePendingSessionPoll(false, refresh, 1000));
    jest.advanceTimersByTime(3000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('background-refreshes on an interval while pending', () => {
    const refresh = jest.fn();
    renderHook(() => usePendingSessionPoll(true, refresh, 1000));
    jest.advanceTimersByTime(2000);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledWith({ background: true });
  });

  it('stops polling when pending clears', () => {
    const refresh = jest.fn();
    const { rerender } = renderHook(
      ({ pending }) => usePendingSessionPoll(pending, refresh, 1000),
      { initialProps: { pending: true } },
    );
    jest.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(1);
    rerender({ pending: false });
    jest.advanceTimersByTime(2000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
