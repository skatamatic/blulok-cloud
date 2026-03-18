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
type MockSocket = {
  readyState: number;
  send: jest.Mock;
  close: jest.Mock;
  addEventListener: jest.Mock;
  removeEventListener: jest.Mock;
};

type WebSocketServiceInternals = {
  ws: WebSocket | null;
  isConnected: boolean;
  subscriptions: Map<string, unknown>;
  subscriptionIds: Map<string, string>;
  messageHandlers: Map<string, Set<(data: unknown) => void>>;
  connectionHandlers: Set<(connected: boolean) => void>;
  reconnectAttempts: number;
  connect: () => void;
  handleOpen: (event: Event, socket: WebSocket) => void;
  handleClose: (event: CloseEvent, socket: WebSocket) => void;
  handleMessage: (event: MessageEvent) => void;
};

let mockWebSocketInstance: MockSocket;
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
}) as unknown as typeof WebSocket;

// Import after mocking
import { websocketService } from '@/services/websocket.service';
const service = websocketService as unknown as WebSocketServiceInternals;

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
    service.ws = mockWebSocketInstance as unknown as WebSocket;
    service.isConnected = true;
    service.subscriptions = new Map();
    service.subscriptionIds = new Map();
    service.messageHandlers = new Map();
    service.connectionHandlers = new Set();
    service.reconnectAttempts = 0;
  });

  describe('Connection status', () => {
    it('should return true when connected', () => {
      expect(websocketService.isWebSocketConnected()).toBe(true);
    });

    it('should return false when not connected', () => {
      service.isConnected = false;
      expect(websocketService.isWebSocketConnected()).toBe(false);
      service.isConnected = true; // Reset
    });
  });

  describe('Connection management', () => {
    it('should not connect without auth token', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      service.connect();
      expect(global.WebSocket).not.toHaveBeenCalled();
    });

    it('should create WebSocket connection with auth token', () => {
      service.connect();
      expect(global.WebSocket).toHaveBeenCalledWith('ws://localhost:3000/ws?token=mock-token');
    });

    it('should not duplicate an open connection', () => {
      const existingSocket = { ...mockWebSocket, readyState: WebSocket.OPEN };
      service.ws = existingSocket as unknown as WebSocket;
      service.connect();
      expect(existingSocket.close).not.toHaveBeenCalled();
    });

    // Event listeners are set up during WebSocket creation and are tested implicitly
    // through the connection and message handling tests
  });

  describe('Subscription management', () => {
    beforeEach(() => {
      service.ws = mockWebSocketInstance as unknown as WebSocket;
      service.isConnected = true;
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
      const handlers = service.messageHandlers.get('general_stats');
      expect(handlers).toBeDefined();
      expect(handlers.has(handler)).toBe(true);
    });

    it('should return cleanup function that removes handler', () => {
      const handler = jest.fn();
      const cleanup = websocketService.onMessage('general_stats', handler);

      // Handler should be present
      const handlers = service.messageHandlers.get('general_stats');
      expect(handlers).toBeDefined();
      expect(handlers.has(handler)).toBe(true);

      cleanup();

      // Handler should be removed (or set should be empty)
      const remainingHandlers = service.messageHandlers.get('general_stats');
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
      expect(service.connectionHandlers.has(handler)).toBe(true);
    });

    it('should return cleanup function that removes handler', () => {
      const handler = jest.fn();
      const cleanup = websocketService.onConnectionChange(handler);

      expect(service.connectionHandlers.has(handler)).toBe(true);

      cleanup();

      expect(service.connectionHandlers.has(handler)).toBe(false);
    });

    it('should call connection handlers on connect', () => {
      const handler = jest.fn();
      websocketService.onConnectionChange(handler);
      const socket = { ...mockWebSocket, readyState: WebSocket.OPEN } as WebSocket;
      service.ws = socket;

      // Simulate connection open by calling the handleOpen method directly
      service.handleOpen({} as Event, socket);

      expect(handler).toHaveBeenCalledWith(true);
    });

    it('should call connection handlers on disconnect', () => {
      const handler = jest.fn();
      websocketService.onConnectionChange(handler);
      const socket = { ...mockWebSocket, readyState: WebSocket.OPEN } as WebSocket;
      service.ws = socket;

      // Simulate connection close by calling the handleClose method with a mock event
      service.handleClose({ code: 1000, reason: 'test', wasClean: true } as CloseEvent, socket);

      expect(handler).toHaveBeenCalledWith(false);
    });
  });

  describe('Message handling', () => {
    beforeEach(() => {
      service.ws = mockWebSocketInstance as unknown as WebSocket;
      service.isConnected = true;
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

      service.handleMessage({ data: messageData } as MessageEvent);

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

      service.handleMessage({ data: batteryMessageData } as MessageEvent);

      expect(handler).toHaveBeenCalledWith({ critical: 2, low: 1, offline: 1 });
    });
  });

  describe('Diagnostics', () => {
    it('should send diagnostics request', () => {
      service.ws = mockWebSocketInstance as unknown as WebSocket;
      service.isConnected = true;

      websocketService.requestDiagnostics();

      expect(mockWebSocketInstance.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"diagnostics"')
      );
    });
  });

  describe('Disconnect', () => {
    it('should close WebSocket connection', () => {
      service.ws = mockWebSocket as unknown as WebSocket;
      service.isConnected = true;

      websocketService.disconnect();

      expect(mockWebSocket.close).toHaveBeenCalled();
      expect(service.isConnected).toBe(false);
    });
  });
});


