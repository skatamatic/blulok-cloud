// Mock dependencies
jest.mock('@/services/websocket-debug.service', () => ({
  websocketDebugService: {
    showDebugToast: jest.fn(),
  },
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

// Mock WebSocket constructor
let mockWebSocketInstance: any;
const mockWebSocket = {
  OPEN: WebSocket.OPEN,
  readyState: WebSocket.OPEN,
  send: jest.fn(),
  close: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};

global.WebSocket = jest.fn(() => {
  mockWebSocketInstance = { ...mockWebSocket };
  return mockWebSocketInstance;
}) as any;

// Import after mocking
import { websocketService } from '@/services/websocket.service';

describe('WebSocketService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mocks
    mockLocalStorage.getItem.mockReturnValue('mock-token');
    mockWebSocket.send.mockClear();
    mockWebSocket.close.mockClear();
    mockWebSocket.addEventListener.mockClear();
    mockWebSocket.removeEventListener.mockClear();

    // Reset service state
    (websocketService as any).ws = mockWebSocketInstance;
    (websocketService as any).isConnected = true;
    (websocketService as any).subscriptions = new Map();
    (websocketService as any).subscriptionIds = new Map();
    (websocketService as any).messageHandlers = new Map();
    (websocketService as any).connectionHandlers = new Set();
    (websocketService as any).reconnectAttempts = 0;
  });

  describe('Connection status', () => {
    it('should return true when connected', () => {
      expect(websocketService.isWebSocketConnected()).toBe(true);
    });

    it('should return false when not connected', () => {
      (websocketService as any).isConnected = false;
      expect(websocketService.isWebSocketConnected()).toBe(false);
      (websocketService as any).isConnected = true; // Reset
    });
  });

  describe('Connection management', () => {
    it('should not connect without auth token', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      (websocketService as any).connect();
      expect(global.WebSocket).not.toHaveBeenCalled();
    });

    it('should create WebSocket connection with auth token', () => {
      (websocketService as any).connect();
      expect(global.WebSocket).toHaveBeenCalledWith('ws://localhost:3000/ws?token=mock-token');
    });

    it('should close existing connection before creating new one', () => {
      (websocketService as any).ws = mockWebSocket;
      (websocketService as any).connect();
      expect(mockWebSocket.close).toHaveBeenCalled();
    });

    // Event listeners are set up during WebSocket creation and are tested implicitly
    // through the connection and message handling tests
  });

  describe('Subscription management', () => {
    beforeEach(() => {
      (websocketService as any).ws = mockWebSocketInstance;
      (websocketService as any).isConnected = true;
      mockWebSocketInstance.readyState = WebSocket.OPEN;
    });

    it('should send subscription message', () => {
      websocketService.subscribe('general_stats');

      expect(mockWebSocketInstance.send).toHaveBeenCalledWith(
        expect.stringContaining('"subscriptionType":"general_stats"')
      );
    });

    it('should not send duplicate subscription', () => {
      websocketService.subscribe('general_stats');
      websocketService.subscribe('general_stats'); // Second call

      expect(mockWebSocketInstance.send).toHaveBeenCalledTimes(1);
    });

    it('should send unsubscription message', () => {
      websocketService.subscribe('general_stats');
      websocketService.unsubscribe('general_stats');

      expect(mockWebSocketInstance.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"unsubscription"')
      );
    });
  });

  describe('Message handlers', () => {
    it('should register message handler for specific type', () => {
      const handler = jest.fn();
      const cleanup = websocketService.onMessage('general_stats', handler);

      expect(typeof cleanup).toBe('function');

      // Check that handler was added to the Set
      const handlers = (websocketService as any).messageHandlers.get('general_stats');
      expect(handlers).toBeDefined();
      expect(handlers.has(handler)).toBe(true);
    });

    it('should return cleanup function that removes handler', () => {
      const handler = jest.fn();
      const cleanup = websocketService.onMessage('general_stats', handler);

      // Handler should be present
      const handlers = (websocketService as any).messageHandlers.get('general_stats');
      expect(handlers).toBeDefined();
      expect(handlers.has(handler)).toBe(true);

      cleanup();

      // Handler should be removed (or set should be empty)
      const remainingHandlers = (websocketService as any).messageHandlers.get('general_stats');
      if (remainingHandlers) {
        expect(remainingHandlers.has(handler)).toBe(false);
      }
    });
  });

  describe('Connection change handlers', () => {
    it('should register connection change handler', () => {
      const handler = jest.fn();
      const cleanup = websocketService.onConnectionChange(handler);

      expect(typeof cleanup).toBe('function');
      expect((websocketService as any).connectionHandlers.has(handler)).toBe(true);
    });

    it('should return cleanup function that removes handler', () => {
      const handler = jest.fn();
      const cleanup = websocketService.onConnectionChange(handler);

      expect((websocketService as any).connectionHandlers.has(handler)).toBe(true);

      cleanup();

      expect((websocketService as any).connectionHandlers.has(handler)).toBe(false);
    });

    it('should call connection handlers on connect', () => {
      const handler = jest.fn();
      websocketService.onConnectionChange(handler);

      // Simulate connection open by calling the handleOpen method directly
      (websocketService as any).handleOpen();

      expect(handler).toHaveBeenCalledWith(true);
    });

    it('should call connection handlers on disconnect', () => {
      const handler = jest.fn();
      websocketService.onConnectionChange(handler);

      // Simulate connection close by calling the handleClose method with a mock event
      (websocketService as any).handleClose({ code: 1000, reason: 'test', wasClean: true });

      expect(handler).toHaveBeenCalledWith(false);
    });
  });

  describe('Message handling', () => {
    beforeEach(() => {
      (websocketService as any).ws = mockWebSocketInstance;
      (websocketService as any).isConnected = true;
    });

    it('should handle data messages', () => {
      const handler = jest.fn();
      websocketService.onMessage('general_stats', handler);

      // Simulate receiving a data message by calling handleMessage directly
      const messageData = JSON.stringify({
        type: 'data',
        subscriptionType: 'general_stats',
        data: { test: 'data' }
      });

      (websocketService as any).handleMessage({ data: messageData });

      expect(handler).toHaveBeenCalledWith({ test: 'data' });
    });

    it('should handle battery status update messages', () => {
      const handler = jest.fn();
      websocketService.onMessage('battery_status', handler);

      // Simulate receiving a battery status update message
      const batteryMessageData = JSON.stringify({
        type: 'battery_status_update',
        subscriptionType: 'battery_status',
        data: { critical: 2, low: 1, offline: 1 }
      });

      (websocketService as any).handleMessage({ data: batteryMessageData });

      expect(handler).toHaveBeenCalledWith({ critical: 2, low: 1, offline: 1 });
    });
  });

  describe('Diagnostics', () => {
    it('should send diagnostics request', () => {
      (websocketService as any).ws = mockWebSocketInstance;
      (websocketService as any).isConnected = true;

      websocketService.requestDiagnostics();

      expect(mockWebSocketInstance.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"diagnostics"')
      );
    });
  });

  describe('Disconnect', () => {
    it('should close WebSocket connection', () => {
      (websocketService as any).ws = mockWebSocket;
      (websocketService as any).isConnected = true;

      websocketService.disconnect();

      expect(mockWebSocket.close).toHaveBeenCalled();
      expect((websocketService as any).isConnected).toBe(false);
    });
  });
});


