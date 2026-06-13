import { act, render, screen } from '@testing-library/react';
import { WebSocketProvider, useWebSocket } from '@/contexts/WebSocketContext';

const mockIsWebSocketConnected = jest.fn();
const mockSubscribe = jest.fn();
const mockUnsubscribe = jest.fn();
const mockHasSubscription = jest.fn(() => false);
const mockOnConnectionChange = jest.fn();
const mockOnReconnectingChange = jest.fn();
const mockOnMessage = jest.fn();
const mockShowDebugToast = jest.fn();

jest.mock('@/services/websocket.service', () => ({
  websocketService: {
    isWebSocketConnected: () => mockIsWebSocketConnected(),
    subscribe: (...args: any[]) => mockSubscribe(...args),
    unsubscribe: (...args: any[]) => mockUnsubscribe(...args),
    hasSubscription: (...args: any[]) => mockHasSubscription(...args),
    onConnectionChange: (...args: any[]) => mockOnConnectionChange(...args),
    onReconnectingChange: (...args: any[]) => mockOnReconnectingChange(...args),
    isWebSocketReconnecting: () => false,
    onMessage: (...args: any[]) => mockOnMessage(...args),
  },
}));

jest.mock('@/services/websocket-debug.service', () => ({
  websocketDebugService: {
    showDebugToast: (...args: any[]) => mockShowDebugToast(...args),
  },
}));

type CtxApi = ReturnType<typeof useWebSocket>;
let latestCtx: CtxApi | null = null;
let connectionHandler: ((connected: boolean) => void) | undefined;
const messageCallbacksByType = new Map<string, Array<(data: any) => void>>();
const messageCleanupByType = new Map<string, Array<jest.Mock>>();
const connectionCleanup = jest.fn();
const reconnectingCleanup = jest.fn();

const ContextProbe = () => {
  latestCtx = useWebSocket();
  return <div data-testid="connected-state">{String(latestCtx.isConnected)} {String(latestCtx.isReconnecting)}</div>;
};

describe('WebSocketContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    latestCtx = null;
    connectionHandler = undefined;
    messageCallbacksByType.clear();
    messageCleanupByType.clear();
    mockHasSubscription.mockReturnValue(false);

    mockIsWebSocketConnected.mockReturnValue(true);
    connectionCleanup.mockReset();

    mockOnConnectionChange.mockImplementation((handler: (connected: boolean) => void) => {
      connectionHandler = handler;
      return connectionCleanup;
    });

    mockOnReconnectingChange.mockImplementation(() => reconnectingCleanup);

    mockOnMessage.mockImplementation((type: string, cb: (data: any) => void) => {
      const callbacks = messageCallbacksByType.get(type) || [];
      callbacks.push(cb);
      messageCallbacksByType.set(type, callbacks);

      const cleanup = jest.fn(() => {
        const current = messageCallbacksByType.get(type) || [];
        messageCallbacksByType.set(type, current.filter((entry) => entry !== cb));
      });
      const cleanups = messageCleanupByType.get(type) || [];
      cleanups.push(cleanup);
      messageCleanupByType.set(type, cleanups);

      return cleanup;
    });
  });

  it('de-duplicates server subscriptions for same type+filters and unsubscribes only when last local subscriber leaves', () => {
    render(
      <WebSocketProvider>
        <ContextProbe />
      </WebSocketProvider>,
    );

    const onMessageA = jest.fn();
    const onMessageB = jest.fn();
    const filters = { facilityId: 'fac-1', group: 'north' };

    let subA = '';
    let subB = '';
    act(() => {
      subA = latestCtx!.subscribe('device_status', onMessageA, undefined, filters);
      subB = latestCtx!.subscribe('device_status', onMessageB, undefined, filters);
    });

    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(mockSubscribe).toHaveBeenCalledWith('device_status', filters);
    expect(mockShowDebugToast).toHaveBeenCalledWith(
      'info',
      'WebSocket Sub (reuse)',
      expect.stringContaining('device_status'),
    );

    act(() => {
      latestCtx!.unsubscribe(subA);
    });
    expect(mockUnsubscribe).not.toHaveBeenCalled();

    act(() => {
      latestCtx!.unsubscribe(subB);
    });
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    expect(mockUnsubscribe).toHaveBeenCalledWith('device_status', filters);
  });

  it('routes message payloads to onMessage and errors to onError', () => {
    render(
      <WebSocketProvider>
        <ContextProbe />
      </WebSocketProvider>,
    );

    const onMessage = jest.fn();
    const onError = jest.fn();

    let subscriptionId = '';
    act(() => {
      subscriptionId = latestCtx!.subscribe('battery_status', onMessage, onError);
    });
    expect(subscriptionId).toContain('sub_battery_status_');

    const callbacks = messageCallbacksByType.get('battery_status') || [];
    expect(callbacks).toHaveLength(1);

    act(() => {
      callbacks[0]({ data: { critical: 1, low: 2 } });
    });
    expect(onMessage).toHaveBeenCalledWith({ critical: 1, low: 2 });
    expect(onError).not.toHaveBeenCalled();

    act(() => {
      callbacks[0]({ error: 'permission denied' });
    });
    expect(onError).toHaveBeenCalledWith('permission denied');
  });

  it('updates connection state from service events and ignores unknown unsubscribe IDs', () => {
    render(
      <WebSocketProvider>
        <ContextProbe />
      </WebSocketProvider>,
    );

    expect(screen.getByTestId('connected-state')).toHaveTextContent('true');

    act(() => {
      connectionHandler?.(false);
    });
    expect(screen.getByTestId('connected-state')).toHaveTextContent('false');

    act(() => {
      latestCtx!.unsubscribe('sub_unknown_1');
    });
    expect(mockUnsubscribe).not.toHaveBeenCalled();
  });

  it('re-asserts server subscriptions after reconnect when transport lost them', () => {
    render(
      <WebSocketProvider>
        <ContextProbe />
      </WebSocketProvider>,
    );

    act(() => {
      latestCtx!.subscribe('activity', jest.fn(), undefined, { facility_id: 'fac-1' });
    });
    expect(mockSubscribe).toHaveBeenCalledTimes(1);

    mockHasSubscription.mockReturnValue(false);
    act(() => {
      connectionHandler?.(false);
      connectionHandler?.(true);
    });

    expect(mockSubscribe).toHaveBeenCalledTimes(2);
    expect(mockSubscribe).toHaveBeenLastCalledWith('activity', { facility_id: 'fac-1' });
  });

  it('cleans up connection and message handlers on unmount', () => {
    const rendered = render(
      <WebSocketProvider>
        <ContextProbe />
      </WebSocketProvider>,
    );

    act(() => {
      latestCtx!.subscribe('general_stats', jest.fn());
      latestCtx!.subscribe('gateway_status', jest.fn());
    });

    const generalCleanups = messageCleanupByType.get('general_stats') || [];
    const gatewayCleanups = messageCleanupByType.get('gateway_status') || [];
    expect(generalCleanups).toHaveLength(1);
    expect(gatewayCleanups).toHaveLength(1);

    rendered.unmount();

    expect(connectionCleanup).toHaveBeenCalledTimes(1);
    expect(generalCleanups[0]).toHaveBeenCalledTimes(1);
    expect(gatewayCleanups[0]).toHaveBeenCalledTimes(1);
  });
});

