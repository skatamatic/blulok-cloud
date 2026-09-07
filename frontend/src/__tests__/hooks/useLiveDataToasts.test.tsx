import { renderHook, act } from '@testing-library/react';
import { useLiveDataToasts, LIVE_DATA_OUTAGE_TOAST_MS } from '@/hooks/useLiveDataToasts';

const mockAddToast = jest.fn();
let mockIsConnected = true;
let mockIsAuthenticated = true;
let mockIsLoading = false;
let mockIntentionalDisconnect = false;
const mockIsWebSocketConnected = jest.fn(() => mockIsConnected);

jest.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    isConnected: mockIsConnected,
    isReconnecting: false,
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  }),
}));

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    authState: {
      isAuthenticated: mockIsAuthenticated,
      isLoading: mockIsLoading,
    },
  }),
}));

jest.mock('@/services/websocket.service', () => ({
  websocketService: {
    isWebSocketConnected: () => mockIsWebSocketConnected(),
    isIntentionalDisconnect: () => mockIntentionalDisconnect,
  },
}));

describe('useLiveDataToasts', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockIsConnected = true;
    mockIsAuthenticated = true;
    mockIsLoading = false;
    mockIntentionalDisconnect = false;
    mockIsWebSocketConnected.mockImplementation(() => mockIsConnected);
    localStorage.setItem('authToken', 'test-token');
  });

  afterEach(() => {
    jest.useRealTimers();
    localStorage.clear();
  });

  it('stays silent for brief disconnects under the grace window', () => {
    const { rerender } = renderHook(() => useLiveDataToasts());

    mockIsConnected = false;
    rerender();

    act(() => {
      jest.advanceTimersByTime(LIVE_DATA_OUTAGE_TOAST_MS - 1);
    });
    expect(mockAddToast).not.toHaveBeenCalled();

    mockIsConnected = true;
    rerender();

    act(() => {
      jest.advanceTimersByTime(LIVE_DATA_OUTAGE_TOAST_MS);
    });
    expect(mockAddToast).not.toHaveBeenCalled();
  });

  it('toasts after 10s outage and again when live data resumes', () => {
    const { rerender } = renderHook(() => useLiveDataToasts());

    // Establish a live session first
    mockIsConnected = true;
    rerender();

    mockIsConnected = false;
    rerender();

    act(() => {
      jest.advanceTimersByTime(LIVE_DATA_OUTAGE_TOAST_MS);
    });

    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        title: 'Live updates paused',
      }),
    );

    mockIsConnected = true;
    rerender();

    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        title: 'Live updates restored',
      }),
    );
  });

  it('does not toast outage before the first successful live connection', () => {
    mockIsConnected = false;
    renderHook(() => useLiveDataToasts());

    act(() => {
      jest.advanceTimersByTime(LIVE_DATA_OUTAGE_TOAST_MS + 1_000);
    });

    expect(mockAddToast).not.toHaveBeenCalled();
  });

  it('does not toast when the user logs out', () => {
    const { rerender } = renderHook(() => useLiveDataToasts());

    mockIsConnected = true;
    rerender();

    mockIntentionalDisconnect = true;
    mockIsConnected = false;
    mockIsAuthenticated = false;
    localStorage.removeItem('authToken');
    rerender();

    act(() => {
      jest.advanceTimersByTime(LIVE_DATA_OUTAGE_TOAST_MS + 1_000);
    });

    expect(mockAddToast).not.toHaveBeenCalled();
  });

  it('cancels a pending outage toast when logout happens during the grace window', () => {
    const { rerender } = renderHook(() => useLiveDataToasts());

    mockIsConnected = true;
    rerender();

    mockIsConnected = false;
    rerender();

    act(() => {
      jest.advanceTimersByTime(LIVE_DATA_OUTAGE_TOAST_MS / 2);
    });

    mockIntentionalDisconnect = true;
    mockIsAuthenticated = false;
    localStorage.removeItem('authToken');
    rerender();

    act(() => {
      jest.advanceTimersByTime(LIVE_DATA_OUTAGE_TOAST_MS);
    });

    expect(mockAddToast).not.toHaveBeenCalled();
  });

  it('does not toast restore after logout cleared an announced outage', () => {
    const { rerender } = renderHook(() => useLiveDataToasts());

    mockIsConnected = true;
    rerender();

    mockIsConnected = false;
    rerender();

    act(() => {
      jest.advanceTimersByTime(LIVE_DATA_OUTAGE_TOAST_MS);
    });
    expect(mockAddToast).toHaveBeenCalledTimes(1);

    mockAddToast.mockClear();
    mockIsAuthenticated = false;
    mockIntentionalDisconnect = true;
    localStorage.removeItem('authToken');
    rerender();

    // If something briefly flips connected during teardown, still stay silent
    mockIsConnected = true;
    rerender();

    expect(mockAddToast).not.toHaveBeenCalled();
  });

  it('does not toast when the session token is already cleared', () => {
    const { rerender } = renderHook(() => useLiveDataToasts());

    mockIsConnected = true;
    rerender();

    localStorage.removeItem('authToken');
    mockIsConnected = false;
    rerender();

    act(() => {
      jest.advanceTimersByTime(LIVE_DATA_OUTAGE_TOAST_MS + 1_000);
    });

    expect(mockAddToast).not.toHaveBeenCalled();
  });
});
