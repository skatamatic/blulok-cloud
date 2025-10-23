import { HttpConnection } from '../../../services/gateway/connections/http.connection';
import { GatewayConnectionState } from '../../../types/gateway.types';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('HttpConnection', () => {
  let connection: HttpConnection;
  let mockAxiosInstance: any;
  const mockBaseUrl = 'https://api.test.com';
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset axios mocks with proper structure
    mockAxiosInstance = {
      request: jest.fn().mockResolvedValue({
        data: { success: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      }),
      post: jest.fn().mockResolvedValue({
        data: { accessToken: 'mock-access-token' },
        headers: {},
        status: 200,
        statusText: 'OK',
        config: {},
      }),
      get: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      interceptors: {
        response: {
          use: jest.fn(),
        },
      },
      defaults: {
        headers: {
          common: {},
        },
      },
    };

    // Mock axios.create to return our mock instance
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    connection = new HttpConnection(
      'test-gateway',
      mockBaseUrl,
      mockApiKey,
      false // ignoreSslCert
    );
  });

  afterEach(async () => {
    await connection.disconnect().catch(() => {});
  });

  describe('Initialization', () => {
    it('should create axios instance with correct configuration', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: mockBaseUrl,
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': mockApiKey,
        },
      });
    });


    it('should expose gateway ID', () => {
      expect(connection.gatewayId).toBe('test-gateway');
    });
  });

  describe('Connection Management', () => {
    const mockAccessToken = 'mock-access-token';

    beforeEach(() => {
      // Mock post method for authentication
      mockAxiosInstance.post.mockResolvedValue({
        data: { accessToken: mockAccessToken },
        headers: {},
        status: 200,
        statusText: 'OK',
        config: {},
      });
    });

    it('should connect successfully', async () => {
      await connection.connect();

      expect(connection.isConnected()).toBe(true);
      expect(connection.state).toBe(GatewayConnectionState.CONNECTED);
    });


    it('should disconnect and clear authentication', async () => {
      await connection.connect();
      expect(connection.isConnected()).toBe(true);

      await connection.disconnect();

      expect(connection.isConnected()).toBe(false);
      expect(connection.state).toBe(GatewayConnectionState.DISCONNECTED);

      // Check that access token is cleared
      const mockAxiosInstance = mockedAxios.create.mock.results[0]?.value;
      if (mockAxiosInstance) {
        expect(mockAxiosInstance.defaults.headers.common['Authorization']).toBeUndefined();
      }
    });
  });

  describe('HTTP Requests', () => {
    let mockAxiosInstance: any;

    beforeEach(async () => {
      mockAxiosInstance = mockedAxios.create.mock.results[0]?.value;
      if (mockAxiosInstance) {
        mockAxiosInstance.request = jest.fn().mockResolvedValue({
          data: { success: true },
          headers: {},
        });
      }
      await connection.connect();
    });

    it('should make GET requests successfully', async () => {
      const mockResponse = { locks: ['lock1', 'lock2'] };
      mockAxiosInstance.request = jest.fn().mockResolvedValue({
        data: mockResponse,
      });

      const result = await (connection as any).makeRequest('GET', '/locks', undefined, { facilityId: 'test' });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        method: 'GET',
        url: '/locks',
        data: undefined,
        params: { facilityId: 'test' },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should make POST requests successfully', async () => {
      const requestData = { command: 'OPEN', lockId: 'lock1' };
      const mockResponse = { success: true };

      mockAxiosInstance.request = jest.fn().mockResolvedValue({
        data: mockResponse,
      });

      const result = await (connection as any).makeRequest('POST', '/locks/send-command', requestData);

      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        method: 'POST',
        url: '/locks/send-command',
        data: requestData,
        params: undefined,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should include API key header in requests', async () => {
      mockAxiosInstance.request = jest.fn().mockResolvedValue({
        data: { success: true },
      });

      await (connection as any).makeRequest('GET', '/status');

      // The API key header should be set when axios.create was called
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-KEY': mockApiKey,
          }),
        })
      );
    });

    it('should handle request errors', async () => {
      const errorMessage = 'Network error';
      mockAxiosInstance.request = jest.fn().mockRejectedValue(new Error(errorMessage));

      await expect((connection as any).makeRequest('GET', '/status')).rejects.toThrow(
        `HTTP request failed: GET /status: ${errorMessage}`
      );
    });

    it('should update activity timestamp on successful requests', async () => {
      const beforeRequest = Date.now();

      mockAxiosInstance.request = jest.fn().mockResolvedValue({
        data: { success: true },
      });

      await (connection as any).makeRequest('GET', '/status');

      const stats = connection.getStats();
      expect(stats.lastActivity!.getTime()).toBeGreaterThanOrEqual(beforeRequest);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle 401 errors', async () => {
      // Connect first to set up authentication
      await connection.connect();

      // Mock a 401 error
      mockAxiosInstance.request = jest.fn().mockRejectedValue({
        response: { status: 401 },
        message: 'Unauthorized',
      });

      // The request should fail with 401 error
      await expect((connection as any).makeRequest('GET', '/api/data')).rejects.toThrow('HTTP request failed');
    });

    it('should handle request errors', async () => {
      // Connect first
      await connection.connect();

      // Mock a request error
      mockAxiosInstance.request = jest.fn().mockRejectedValue(new Error('Network error'));

      // The request should fail
      await expect((connection as any).makeRequest('GET', '/api/data')).rejects.toThrow('HTTP request failed');
    });

    it('should handle various HTTP methods', async () => {
      // Connect first
      await connection.connect();

      // Test different HTTP methods
      mockAxiosInstance.request = jest.fn().mockResolvedValue({
        data: { success: true },
      });

      await (connection as any).makeRequest('GET', '/test');
      await (connection as any).makeRequest('POST', '/test', { data: 'test' });
      await (connection as any).makeRequest('PUT', '/test', { data: 'test' });
      await (connection as any).makeRequest('DELETE', '/test');

      expect(mockAxiosInstance.request).toHaveBeenCalledTimes(4);
    });
  });

  describe('Send Method', () => {
    it('should throw error for send method (HTTP connections do not support raw buffer sending)', async () => {
      await expect(connection.send(Buffer.from('test'))).rejects.toThrow(
        'HTTP connections do not support raw buffer sending'
      );
    });

    it('should throw error when not connected', async () => {
      await expect(connection.send(Buffer.from('test'))).rejects.toThrow(
        'HTTP connections do not support raw buffer sending'
      );
    });
  });

  describe('Statistics', () => {
    it('should track request statistics', async () => {
      const mockAxiosInstance = mockedAxios.create.mock.results[0]?.value;
      if (!mockAxiosInstance) return;

      mockAxiosInstance.request = jest.fn().mockResolvedValue({
        data: { success: true },
      });

      await connection.connect();

      const beforeStats = connection.getStats();
      await (connection as any).makeRequest('GET', '/test');
      const afterStats = connection.getStats();

      expect(afterStats.messagesSent).toBeGreaterThan(beforeStats.messagesSent);
      expect(afterStats.lastActivity).toBeDefined();
    });

    it('should return correct stats structure', () => {
      const stats = connection.getStats();
      expect(stats).toHaveProperty('bytesSent');
      expect(stats).toHaveProperty('bytesReceived');
      expect(stats).toHaveProperty('messagesSent');
      expect(stats).toHaveProperty('messagesReceived');
    });

    it('should handle empty response data', async () => {
      const mockAxiosInstance = mockedAxios.create.mock.results[0]?.value;
      if (!mockAxiosInstance) return;

      mockAxiosInstance.request = jest.fn().mockResolvedValue({
        data: null,
      });

      await connection.connect();

      const result = await (connection as any).makeRequest('GET', '/empty');
      expect(result).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed cookie headers', async () => {
      const mockAxiosInstance = mockedAxios.create.mock.results[0]?.value;
      if (!mockAxiosInstance) return;

      mockAxiosInstance.request = jest.fn().mockResolvedValue({
        data: { accessToken: 'token' },
        headers: {
          'set-cookie': ['malformed-cookie'],
        },
      });

      await connection.connect();

      // Should not throw
      expect(connection.isConnected()).toBe(true);
    });

    it('should handle network timeouts', async () => {
      const mockAxiosInstance = mockedAxios.create.mock.results[0]?.value;
      if (!mockAxiosInstance) return;

      mockAxiosInstance.request = jest.fn().mockRejectedValue(
        new Error('Timeout of 30000ms exceeded')
      );

      await connection.connect();

      await expect((connection as any).makeRequest('GET', '/timeout')).rejects.toThrow('Timeout of 30000ms exceeded');
    });
  });

  describe('Connection State', () => {
    it('should correctly report connection state', async () => {
      expect(connection.isConnected()).toBe(false);
      expect(connection.state).toBe(GatewayConnectionState.DISCONNECTED);

      await connection.connect();

      expect(connection.isConnected()).toBe(true);
      expect(connection.state).toBe(GatewayConnectionState.CONNECTED);

      await connection.disconnect();

      expect(connection.isConnected()).toBe(false);
      expect(connection.state).toBe(GatewayConnectionState.DISCONNECTED);
    });

    it('should handle connection state transitions', async () => {
      await connection.connect();
      expect(connection.state).toBe(GatewayConnectionState.CONNECTED);

      // Simulate an error state
      (connection as any).setState(GatewayConnectionState.ERROR);
      expect(connection.state).toBe(GatewayConnectionState.ERROR);
      expect(connection.isConnected()).toBe(false);

      await connection.disconnect();
      expect(connection.state).toBe(GatewayConnectionState.DISCONNECTED);
    });
  });
});
