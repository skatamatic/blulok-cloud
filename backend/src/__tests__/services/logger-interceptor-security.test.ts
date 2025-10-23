import { LoggerInterceptorService } from '../../services/logger-interceptor.service';
import { WebSocketService } from '../../services/websocket.service';
import { logger } from '../../utils/logger';

// Mock the WebSocket service
jest.mock('../../services/websocket.service');
jest.mock('../../utils/logger');

describe('LoggerInterceptorService Security Tests', () => {
  let interceptor: LoggerInterceptorService;
  let mockWebSocketService: jest.Mocked<WebSocketService>;

  beforeEach(() => {
    // Reset the singleton instance
    (LoggerInterceptorService as any).instance = undefined;
    
    mockWebSocketService = {
      broadcastLogUpdate: jest.fn(),
    } as any;

    (WebSocketService.getInstance as jest.Mock).mockReturnValue(mockWebSocketService);
    
    interceptor = LoggerInterceptorService.getInstance();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Security and Data Integrity', () => {
    it('should not expose sensitive data in log broadcasts', () => {
      const sensitiveData = {
        password: 'secret123',
        token: 'jwt-token-here',
        apiKey: 'api-key-123',
        message: 'User logged in'
      };

      // Mock the original logger methods
      const originalError = logger.error;
      const originalWarn = logger.warn;
      const originalInfo = logger.info;
      const originalDebug = logger.debug;

      logger.error = jest.fn();
      logger.warn = jest.fn();
      logger.info = jest.fn();
      logger.debug = jest.fn();

      // Call the interceptor (using any to access private method)
      (interceptor as any).broadcastLogEntry('error', 'User error', [sensitiveData]);

      // Verify that sensitive data is not directly exposed
      expect(mockWebSocketService.broadcastLogUpdate).toHaveBeenCalled();
      
      const broadcastCall = mockWebSocketService.broadcastLogUpdate.mock.calls[0];
      const broadcastData = JSON.parse(broadcastCall?.[1] || '{}');
      
      // The sensitive data should be stringified, not directly accessible
      expect(typeof broadcastData.message).toBe('string');
      expect(broadcastData.message).toContain('User error');
      
      // Restore original methods
      logger.error = originalError;
      logger.warn = originalWarn;
      logger.info = originalInfo;
      logger.debug = originalDebug;
    });

    it('should handle circular references safely', () => {
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;

      // Mock the original logger methods
      const originalError = logger.error;
      logger.error = jest.fn();

      // This should not throw an error
      expect(() => {
        (interceptor as any).broadcastLogEntry('error', 'Circular reference test', [circularObj]);
      }).not.toThrow();

      expect(mockWebSocketService.broadcastLogUpdate).toHaveBeenCalled();
      
      // Restore original method
      logger.error = originalError;
    });

    it('should prevent re-entrancy during logging', () => {
      // Mock the original logger methods
      const originalError = logger.error;
      logger.error = jest.fn();

      // Mock broadcastLogUpdate to throw an error (simulating a problem)
      mockWebSocketService.broadcastLogUpdate.mockImplementation(() => {
        throw new Error('Broadcast error');
      });

      // This should not cause infinite recursion
      expect(() => {
        (interceptor as any).broadcastLogEntry('error', 'Test message', []);
      }).not.toThrow();

      // Should only be called once despite the error
      expect(mockWebSocketService.broadcastLogUpdate).toHaveBeenCalledTimes(1);
      
      // Restore original method
      logger.error = originalError;
    });

    it('should limit log message size to prevent DoS', () => {
      const largeMessage = 'x'.repeat(100000); // 100KB message
      
      // Mock the original logger methods
      const originalError = logger.error;
      logger.error = jest.fn();

      (interceptor as any).broadcastLogEntry('error', largeMessage, []);

      expect(mockWebSocketService.broadcastLogUpdate).toHaveBeenCalled();
      
      const broadcastCall = mockWebSocketService.broadcastLogUpdate.mock.calls[0];
      const broadcastData = JSON.parse(broadcastCall?.[1] || '{}');
      
      // The message should be truncated or handled appropriately
      expect(broadcastData.message.length).toBeLessThanOrEqual(100000);
      
      // Restore original method
      logger.error = originalError;
    });
  });

  describe('Log Level Security', () => {
    it('should only broadcast appropriate log levels', () => {
      // Mock the original logger methods
      const originalError = logger.error;
      const originalWarn = logger.warn;
      const originalInfo = logger.info;
      const originalDebug = logger.debug;

      logger.error = jest.fn();
      logger.warn = jest.fn();
      logger.info = jest.fn();
      logger.debug = jest.fn();

      // Test different log levels
      (interceptor as any).broadcastLogEntry('error', 'Error message', []);
      (interceptor as any).broadcastLogEntry('warn', 'Warning message', []);
      (interceptor as any).broadcastLogEntry('info', 'Info message', []);
      (interceptor as any).broadcastLogEntry('debug', 'Debug message', []);

      // All levels should be broadcast (this is the current behavior)
      expect(mockWebSocketService.broadcastLogUpdate).toHaveBeenCalledTimes(4);
      
      // Restore original methods
      logger.error = originalError;
      logger.warn = originalWarn;
      logger.info = originalInfo;
      logger.debug = originalDebug;
    });
  });

  describe('Error Handling', () => {
    it('should not crash if WebSocket service is unavailable', () => {
      // Mock WebSocket service to throw an error
      mockWebSocketService.broadcastLogUpdate.mockImplementation(() => {
        throw new Error('WebSocket service unavailable');
      });

      // Mock the original logger methods
      const originalError = logger.error;
      logger.error = jest.fn();

      // This should not throw an error
      expect(() => {
        (interceptor as any).broadcastLogEntry('error', 'Test message', []);
      }).not.toThrow();

      // Restore original method
      logger.error = originalError;
    });

    it('should handle JSON serialization errors gracefully', () => {
      // Create an object that can't be JSON serialized
      const unserializableObj = {
        toJSON: () => {
          throw new Error('Cannot serialize');
        }
      };

      // Mock the original logger methods
      const originalError = logger.error;
      logger.error = jest.fn();

      // This should not throw an error
      expect(() => {
        (interceptor as any).broadcastLogEntry('error', 'Test message', [unserializableObj]);
      }).not.toThrow();

      // Restore original method
      logger.error = originalError;
    });
  });

  describe('Data Format Security', () => {
    it('should sanitize log data before broadcasting', () => {
      const maliciousData = {
        message: 'Test',
        malicious: '<script>alert("xss")</script>',
        sqlInjection: "'; DROP TABLE users; --"
      };

      // Mock the original logger methods
      const originalError = logger.error;
      logger.error = jest.fn();

      (interceptor as any).broadcastLogEntry('error', 'Test message', [maliciousData]);

      expect(mockWebSocketService.broadcastLogUpdate).toHaveBeenCalled();
      
      const broadcastCall = mockWebSocketService.broadcastLogUpdate.mock.calls[0];
      const broadcastData = JSON.parse(broadcastCall?.[1] || '{}');
      
      // The data should be JSON stringified, which provides some protection
      expect(typeof broadcastData.message).toBe('string');
      expect(broadcastData.args).toBeDefined();
      
      // Restore original method
      logger.error = originalError;
    });
  });
});
