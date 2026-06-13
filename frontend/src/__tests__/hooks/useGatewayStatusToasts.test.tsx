import { renderHook, act } from '@testing-library/react';
import { useGatewayStatusToasts } from '@/hooks/useGatewayStatusToasts';
import { GATEWAY_OFFLINE_TOAST_GRACE_MS } from '@/constants/gateway-liveness.constants';

const mockSubscribe = jest.fn();
const mockUnsubscribe = jest.fn();
const mockAddToast = jest.fn();

jest.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
  }),
}));

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

describe('useGatewayStatusToasts', () => {
  let statusHandler: (data: unknown) => void;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockSubscribe.mockImplementation((_type, handler) => {
      statusHandler = handler;
      return 'sub-1';
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('debounces offline toasts and suppresses them on quick reconnect', () => {
    renderHook(() => useGatewayStatusToasts());

    act(() => {
      statusHandler({
        gateways: [
          {
            id: 'gw-1',
            name: 'Max Gateway',
            status: 'online',
            connected: true,
          },
        ],
      });
    });

    act(() => {
      statusHandler({
        gateways: [
          {
            id: 'gw-1',
            name: 'Max Gateway',
            status: 'online',
            connected: false,
          },
        ],
      });
    });

    expect(mockAddToast).not.toHaveBeenCalled();

    act(() => {
      statusHandler({
        gateways: [
          {
            id: 'gw-1',
            name: 'Max Gateway',
            status: 'online',
            connected: true,
          },
        ],
      });
    });

    act(() => {
      jest.advanceTimersByTime(GATEWAY_OFFLINE_TOAST_GRACE_MS);
    });

    expect(mockAddToast).not.toHaveBeenCalled();
  });

  it('shows offline toast after grace period and online toast after confirmed outage', () => {
    renderHook(() => useGatewayStatusToasts());

    act(() => {
      statusHandler({
        gateways: [
          {
            id: 'gw-1',
            name: 'Max Gateway',
            status: 'online',
            connected: true,
          },
        ],
      });
    });

    act(() => {
      statusHandler({
        gateways: [
          {
            id: 'gw-1',
            name: 'Max Gateway',
            status: 'online',
            connected: false,
          },
        ],
      });
    });

    act(() => {
      jest.advanceTimersByTime(GATEWAY_OFFLINE_TOAST_GRACE_MS);
    });

    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        title: 'Max Gateway is offline',
      }),
    );

    act(() => {
      statusHandler({
        gateways: [
          {
            id: 'gw-1',
            name: 'Max Gateway',
            status: 'online',
            connected: true,
          },
        ],
      });
    });

    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        title: 'Max Gateway is back online',
      }),
    );
  });
});
