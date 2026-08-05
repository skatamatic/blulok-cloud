/**
 * @jest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { useAccessHistoryLiveUpdates } from '@/hooks/useAccessHistoryLiveUpdates';
import { AccessLog } from '@/types/access-history.types';

const mockSubscribe = jest.fn();
const mockUnsubscribe = jest.fn();

jest.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    isConnected: true,
  }),
}));

const baseLog: AccessLog = {
  id: 'log-live-1',
  device_id: 'dev-1',
  device_type: 'blulok',
  facility_id: 'fac-1',
  action: 'unlock',
  method: 'admin_remote',
  success: true,
  occurred_at: '2026-06-16T18:00:00.000Z',
  created_at: '2026-06-16T18:00:00.000Z',
  updated_at: '2026-06-16T18:00:00.000Z',
};

describe('useAccessHistoryLiveUpdates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscribe.mockReturnValue('sub-1');
  });

  it('prepends matching live rows and bumps onPrepended', () => {
    const onPrepend = jest.fn((updater: (prev: AccessLog[]) => AccessLog[]) => {
      updater([]);
    });
    const onPrepended = jest.fn();
    const onFallbackRefresh = jest.fn();

    renderHook(() =>
      useAccessHistoryLiveUpdates({
        enabled: true,
        liveFilters: { method: 'cloud' },
        maxRows: 20,
        canPrepend: true,
        onPrepend,
        onPrepended,
        onFallbackRefresh,
      }),
    );

    const handler = mockSubscribe.mock.calls[0][1] as (data: unknown) => void;
    act(() => {
      handler({
        eventType: 'activity_new',
        payload: { accessLog: baseLog },
      });
    });

    expect(onPrepend).toHaveBeenCalled();
    expect(onPrepended).toHaveBeenCalled();
    expect(onFallbackRefresh).not.toHaveBeenCalled();
  });

  it('refreshes when canPrepend is false', () => {
    const onFallbackRefresh = jest.fn();
    renderHook(() =>
      useAccessHistoryLiveUpdates({
        enabled: true,
        liveFilters: {},
        maxRows: 20,
        canPrepend: false,
        onPrepend: jest.fn(),
        onFallbackRefresh,
      }),
    );

    const handler = mockSubscribe.mock.calls[0][1] as (data: unknown) => void;
    act(() => {
      handler({
        eventType: 'activity_new',
        payload: { accessLog: baseLog },
      });
    });

    expect(onFallbackRefresh).toHaveBeenCalledWith({ background: true });
  });

  it('ignores activity_update transitional events', () => {
    const onPrepend = jest.fn();
    const onFallbackRefresh = jest.fn();
    renderHook(() =>
      useAccessHistoryLiveUpdates({
        enabled: true,
        liveFilters: {},
        maxRows: 20,
        canPrepend: true,
        onPrepend,
        onFallbackRefresh,
      }),
    );

    const handler = mockSubscribe.mock.calls[0][1] as (data: unknown) => void;
    act(() => {
      handler({ eventType: 'activity_update', payload: { accessLog: baseLog } });
    });

    expect(onPrepend).not.toHaveBeenCalled();
    expect(onFallbackRefresh).not.toHaveBeenCalled();
  });

  it('does not subscribe when disabled', () => {
    renderHook(() =>
      useAccessHistoryLiveUpdates({
        enabled: false,
        liveFilters: {},
        maxRows: 20,
        canPrepend: true,
        onPrepend: jest.fn(),
        onFallbackRefresh: jest.fn(),
      }),
    );
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it('ignores rows that fail live filters', () => {
    const onPrepend = jest.fn();
    const onFallbackRefresh = jest.fn();
    renderHook(() =>
      useAccessHistoryLiveUpdates({
        enabled: true,
        liveFilters: { method: 'keypad' },
        maxRows: 20,
        canPrepend: true,
        onPrepend,
        onFallbackRefresh,
      }),
    );

    const handler = mockSubscribe.mock.calls[0][1] as (data: unknown) => void;
    act(() => {
      handler({
        eventType: 'activity_new',
        payload: { accessLog: { ...baseLog, method: 'admin_remote' } },
      });
    });

    expect(onPrepend).not.toHaveBeenCalled();
    expect(onFallbackRefresh).not.toHaveBeenCalled();
  });

  it('background-refreshes when payload cannot be parsed into an access log', () => {
    const onFallbackRefresh = jest.fn();
    renderHook(() =>
      useAccessHistoryLiveUpdates({
        enabled: true,
        liveFilters: {},
        maxRows: 20,
        canPrepend: true,
        onPrepend: jest.fn(),
        onFallbackRefresh,
      }),
    );

    const handler = mockSubscribe.mock.calls[0][1] as (data: unknown) => void;
    act(() => {
      handler({ eventType: 'activity_new', payload: { notAnAccessLog: true } });
    });

    expect(onFallbackRefresh).toHaveBeenCalledWith({ background: true });
  });
});
