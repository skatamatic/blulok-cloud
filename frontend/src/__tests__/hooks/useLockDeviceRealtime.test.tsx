import { render, act } from '@testing-library/react';
import { useLockDeviceRealtime } from '@/hooks/useLockDeviceRealtime';

const mockSubscribe = jest.fn();
const mockUnsubscribe = jest.fn();

jest.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    isConnected: true,
  }),
}));

function TestHarness(props: Parameters<typeof useLockDeviceRealtime>[0]) {
  useLockDeviceRealtime(props);
  return null;
}

describe('useLockDeviceRealtime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    let subSeq = 0;
    mockSubscribe.mockImplementation(() => `sub-mock-${++subSeq}`);
    mockUnsubscribe.mockClear();
    mockSubscribe.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('subscribes to device_status with device_id filter when deviceId is set', () => {
    const onDeviceRows = jest.fn();
    render(
      <TestHarness deviceId="dev-1" onDeviceRows={onDeviceRows} subscribeUnitsForRefresh={false} />
    );

    expect(mockSubscribe).toHaveBeenCalledWith(
      'device_status',
      expect.any(Function),
      undefined,
      { device_id: 'dev-1' }
    );
  });

  it('subscribes to device_status with facility_id when facilityId is set and no deviceId', () => {
    render(
      <TestHarness
        facilityId="fac-1"
        debouncedRefresh={jest.fn()}
        subscribeUnitsForRefresh={false}
      />
    );

    expect(mockSubscribe).toHaveBeenCalledWith(
      'device_status',
      expect.any(Function),
      undefined,
      { facility_id: 'fac-1' }
    );
  });

  it('invokes onDeviceRows with normalized rows for matching device', () => {
    const onDeviceRows = jest.fn();
    render(
      <TestHarness deviceId="dev-1" onDeviceRows={onDeviceRows} subscribeUnitsForRefresh={false} />
    );

    const handler = mockSubscribe.mock.calls.find((c) => c[0] === 'device_status')?.[1] as (
      msg: unknown
    ) => void;
    expect(handler).toBeDefined();

    act(() => {
      handler({ devices: [{ id: 'dev-1', lock_status: 'unlocked' }, { id: 'dev-2', lock_status: 'locked' }] });
    });

    expect(onDeviceRows).toHaveBeenCalledWith([
      expect.objectContaining({ device_id: 'dev-1', lock_status: 'unlocked' }),
    ]);
  });

  it('subscribes to gateway_status when facilityId and debouncedRefresh are set', () => {
    render(
      <TestHarness
        facilityId="fac-1"
        debouncedRefresh={jest.fn()}
        subscribeUnitsForRefresh={false}
      />
    );

    expect(mockSubscribe).toHaveBeenCalledWith(
      'gateway_status',
      expect.any(Function),
      undefined,
    );
  });

  it('debounces debouncedRefresh on gateway_status for scoped facility', () => {
    const debouncedRefresh = jest.fn();
    render(
      <TestHarness
        facilityId="fac-1"
        debouncedRefresh={debouncedRefresh}
        debounceMs={400}
        subscribeUnitsForRefresh={false}
      />
    );

    const handler = mockSubscribe.mock.calls.find((c) => c[0] === 'gateway_status')?.[1] as (
      msg: unknown
    ) => void;
    expect(handler).toBeDefined();

    act(() => {
      handler({
        data: {
          gateways: [{ facilityId: 'fac-2', connected: false }],
        },
      });
    });
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(debouncedRefresh).not.toHaveBeenCalled();

    act(() => {
      handler({
        data: {
          gateways: [{ facilityId: 'fac-1', connected: false }],
        },
      });
    });
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(debouncedRefresh).toHaveBeenCalled();
  });

  it('debounces debouncedRefresh and respects debounceRefreshFilter', () => {
    const debouncedRefresh = jest.fn();
    const debounceRefreshFilter = jest.fn().mockReturnValue(false);

    render(
      <TestHarness
        debouncedRefresh={debouncedRefresh}
        debounceRefreshFilter={debounceRefreshFilter}
        debounceMs={400}
      />
    );

    const handler = mockSubscribe.mock.calls.find((c) => c[0] === 'device_status')?.[1] as (
      msg: unknown
    ) => void;

    act(() => {
      handler({ devices: [{ id: 'x' }] });
    });

    expect(debounceRefreshFilter).toHaveBeenCalled();
    expect(debouncedRefresh).not.toHaveBeenCalled();

    debounceRefreshFilter.mockReturnValue(true);
    act(() => {
      handler({ devices: [{ id: 'x' }] });
    });
    act(() => {
      jest.advanceTimersByTime(400);
    });

    expect(debouncedRefresh).toHaveBeenCalled();
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = render(<TestHarness debouncedRefresh={jest.fn()} />);
    const ids = mockSubscribe.mock.results.map((r) => r.value as string);
    unmount();
    ids.forEach((id) => {
      expect(mockUnsubscribe).toHaveBeenCalledWith(id);
    });
  });
});
