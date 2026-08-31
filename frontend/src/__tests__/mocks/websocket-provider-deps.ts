/**
 * Shared mocks for tests that render the real WebSocketProvider.
 * Import this module before WebSocketProvider in test files.
 */
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    authState: {
      isAuthenticated: true,
      isLoading: false,
      user: null,
      token: 'mock-token',
    },
  }),
}));

jest.mock('@/services/websocket.service', () => ({
  websocketService: {
    isWebSocketConnected: jest.fn().mockReturnValue(true),
    isWebSocketReconnecting: jest.fn().mockReturnValue(false),
    subscribe: jest.fn(),
    reassertSubscription: jest.fn(),
    unsubscribe: jest.fn(),
    retryConnectionIfNeeded: jest.fn(),
    hasSubscription: jest.fn().mockReturnValue(false),
    onConnectionChange: jest.fn().mockReturnValue(jest.fn()),
    onReconnectingChange: jest.fn().mockReturnValue(jest.fn()),
    onMessage: jest.fn().mockReturnValue(jest.fn()),
  },
}));

jest.mock('@/services/websocket-debug.service', () => ({
  websocketDebugService: {
    showDebugToast: jest.fn(),
  },
}));
