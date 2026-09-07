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

  describe('access_session_upsert', () => {
    const baseSession = {
      id: 'sess-1',
      state: 'pending',
      device_id: 'dev-1',
      device_type: 'blulok',
      facility_id: 'fac-1',
      unit_id: 'unit-1',
      method: 'admin_remote',
      outcome: 'granted',
      started_at: '2026-06-16T18:00:00.000Z',
      unit_number: 'A-101',
      facility_name: 'Test Facility',
    };

    const renderSessionHook = (overrides: Record<string, unknown> = {}) => {
      const onSessionUpsert = jest.fn((updater: (prev: never[]) => unknown) => {
        updater([]);
      });
      const onSessionUpserted = jest.fn();
      const onFallbackRefresh = jest.fn();

      renderHook(() =>
        useAccessHistoryLiveUpdates({
          enabled: true,
          liveFilters: {},
          maxRows: 20,
          canUpsertSessions: true,
          onSessionUpsert: onSessionUpsert as never,
          onSessionUpserted,
          onFallbackRefresh,
          ...overrides,
        }),
      );

      return {
        handler: mockSubscribe.mock.calls[0][1] as (data: unknown) => void,
        onSessionUpsert,
        onSessionUpserted,
        onFallbackRefresh,
      };
    };

    it('upserts a session row without triggering a refetch', () => {
      const { handler, onSessionUpsert, onSessionUpserted, onFallbackRefresh } = renderSessionHook();

      act(() => {
        handler({
          eventType: 'access_session_upsert',
          payload: { session: baseSession, changed: ['state'] },
        });
      });

      expect(onSessionUpsert).toHaveBeenCalled();
      expect(onSessionUpserted).toHaveBeenCalled();
      expect(onFallbackRefresh).not.toHaveBeenCalled();
    });

    it('refetches instead of upserting when the backend reports a missing row', () => {
      const { handler, onSessionUpsert, onFallbackRefresh } = renderSessionHook();

      act(() => {
        handler({
          eventType: 'access_session_upsert',
          payload: { session: null, changed: ['state'] },
        });
      });

      expect(onSessionUpsert).not.toHaveBeenCalled();
      expect(onFallbackRefresh).toHaveBeenCalledWith({ background: true });
    });

    it('refetches when the session payload is not a usable row', () => {
      const { handler, onSessionUpsert, onFallbackRefresh } = renderSessionHook();

      act(() => {
        handler({
          eventType: 'access_session_upsert',
          payload: { session: { id: 'sess-1', state: 'not-a-state' } },
        });
      });

      expect(onSessionUpsert).not.toHaveBeenCalled();
      expect(onFallbackRefresh).toHaveBeenCalledWith({ background: true });
    });

    it('drops sessions that fail the live filters', () => {
      const { handler, onSessionUpsert, onFallbackRefresh } = renderSessionHook({
        liveFilters: { unit_id: 'unit-other' },
      });

      act(() => {
        handler({
          eventType: 'access_session_upsert',
          payload: { session: baseSession },
        });
      });

      expect(onSessionUpsert).not.toHaveBeenCalled();
      expect(onFallbackRefresh).not.toHaveBeenCalled();
    });
  });
});
