import { renderHook, act } from '@testing-library/react';
import { useGatewayStatusToasts } from '@/hooks/useGatewayStatusToasts';

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
    jest.clearAllMocks();
    mockSubscribe.mockImplementation((_type, handler) => {
      statusHandler = handler;
      return 'sub-1';
    });
  });

  it('does not toast when product liveness stays online across a brief flap', () => {
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

    // Backend product liveness keeps connected=true during grace — no offline transition.
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

    expect(mockAddToast).not.toHaveBeenCalled();
  });

  it('toasts immediately on confirmed offline and again when back online', () => {
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
            status: 'offline',
            connected: false,
          },
        ],
      });
    });

    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        title: 'Max Gateway is offline',
        message: 'Gateway connection lost.',
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
