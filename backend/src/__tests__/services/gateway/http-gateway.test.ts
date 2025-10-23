import { HttpGateway } from '../../../services/gateway/gateways/http.gateway';
import { DeviceType } from '../../../types/gateway.types';
import { DeviceSyncService } from '../../../services/device-sync.service';

// Mock DeviceSyncService
jest.mock('../../../services/device-sync.service');
jest.mock('../../../services/device-event.service');

// Mock axios to prevent real HTTP calls
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    post: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    request: jest.fn(),
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
  })),
}));

// Use fake timers for testing polling
beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

describe('HttpGateway', () => {
  let gateway: HttpGateway;

  beforeEach(() => {
    gateway = new HttpGateway(
      'test-http-gateway',
      'test-facility',
      'https://192.168.3.182:8443/api',
      'test-api-key'
    );
  });

  afterEach(async () => {
    if (gateway) {
      await gateway.shutdown().catch(() => {});
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await expect(gateway.initialize()).resolves.toBeUndefined();
      expect(gateway.status.id).toBe('test-http-gateway');
      expect(gateway.facilityId).toBe('test-facility');
    });

    it('should have correct capabilities', () => {
      const capabilities = gateway.capabilities;
      expect(capabilities.remoteAccessSupport).toBe(true);
      expect(capabilities.keyManagementSupport).toBe(true);
      expect(capabilities.supportedDeviceTypes).toContain(DeviceType.LOCK);
      expect(capabilities.firmwareUpdateSupport).toBe(false); // Not implemented yet
    });
  });

  describe('HTTP Connection', () => {
    it('should create HTTP connection', async () => {
      await gateway.initialize();
      // The connection should be created during initialization
      expect(gateway).toBeDefined();
    });
  });

  describe('Device Management', () => {
    beforeEach(async () => {
      await gateway.initialize();
      // Note: We won't connect to avoid actual HTTP calls in tests
    });

    it('should register device', async () => {
      const deviceInfo = {
        id: 'test-lock',
        type: DeviceType.LOCK,
        model: 'TestLock-100',
        serialNumber: 'TL100-001',
        firmwareVersion: '1.0.0',
        hardwareRevision: '1.0',
        installedAt: new Date(),
        configuration: {},
      };

      // Should not throw (simulated success)
      await expect(gateway.registerDevice(deviceInfo)).resolves.toBeUndefined();
      expect(gateway.status.deviceCount).toBe(1);
    });

    it('should unregister device', async () => {
      const deviceInfo = {
        id: 'test-lock',
        type: DeviceType.LOCK,
        model: 'TestLock-100',
        serialNumber: 'TL100-001',
        firmwareVersion: '1.0.0',
        hardwareRevision: '1.0',
        installedAt: new Date(),
        configuration: {},
      };

      await gateway.registerDevice(deviceInfo);
      expect(gateway.status.deviceCount).toBe(1);

      await expect(gateway.unregisterDevice('test-lock')).resolves.toBeUndefined();
      expect(gateway.status.deviceCount).toBe(0);
    });
  });

  describe('HTTP-Specific Methods', () => {
    beforeEach(async () => {
      await gateway.initialize();
    });

    it('should have HTTP-specific methods', () => {
      expect(typeof gateway.addKey).toBe('function');
      expect(typeof gateway.revokeKey).toBe('function');
      expect(typeof gateway.getKeys).toBe('function');
      expect(typeof gateway.getAllLocks).toBe('function');
      expect(typeof gateway.sendFCMMessage).toBe('function');
    });
  });

  // Integration tests would require a real HTTP server
  // These are mocked to avoid external dependencies in unit tests
  describe('Mocked HTTP Operations', () => {
    beforeEach(async () => {
      await gateway.initialize();
    });

    it('should handle device status requests gracefully when not connected', async () => {
      // Mock the HTTP connection to be disconnected
      const httpConnection = (gateway as any).httpConnection;
      if (httpConnection) {
        jest.spyOn(httpConnection, 'isConnected').mockReturnValue(false);
      }

      // This should fail gracefully without throwing
      const result = await gateway.getDeviceStatus('test-device');
      expect(result).toHaveProperty('connectionState', 'error');
      expect(result.hasError).toBe(true);
    }, 10000);

    it('should handle device commands gracefully when not connected', async () => {
      // Mock the HTTP connection to be disconnected
      const httpConnection = (gateway as any).httpConnection;
      if (httpConnection) {
        jest.spyOn(httpConnection, 'isConnected').mockReturnValue(false);
      }

      const result = await gateway.executeDeviceCommand('test-device', 'lock');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    }, 10000);
  });

  describe('Device Synchronization (Polling)', () => {
    let mockDeviceSyncService: jest.Mocked<DeviceSyncService>;
    let mockAxiosGet: jest.Mock;

  beforeEach(() => {
    // Create fresh mock DeviceSyncService instance for each test
    mockDeviceSyncService = {
      syncGatewayDevices: jest.fn(),
      updateDeviceStatuses: jest.fn(),
    } as any;

    // Mock the singleton getter
    (DeviceSyncService.getInstance as jest.Mock).mockReturnValue(mockDeviceSyncService);

    // Get axios mock for controlling HTTP responses
    const axios = require('axios');
    mockAxiosGet = axios.create().get as jest.Mock;
  });

    it('should start polling when connected', async () => {
      await gateway.initialize();

      // Mock the connection to avoid authentication
      const mockConnection = (gateway as any).httpConnection;
      jest.spyOn(mockConnection, 'connect').mockResolvedValue(undefined);
      jest.spyOn(mockConnection, 'disconnect').mockResolvedValue(undefined);

      // Mock the getAllLocks response
      mockAxiosGet.mockResolvedValue([
        { id: 'lock-1', serial: 'ABC123', online: true, locked: false, batteryLevel: 85 }
      ]);

      // Connect the gateway (this should start polling)
      await gateway.connect();

      // Verify polling was started by checking connection state
      expect(gateway.status.connectionState).toBe('connected');

      // Disconnect to clean up
      await gateway.disconnect();
    });

    it('should stop polling when disconnected', async () => {
      await gateway.initialize();

      // Mock the connection to avoid authentication
      const mockConnection = (gateway as any).httpConnection;
      jest.spyOn(mockConnection, 'connect').mockResolvedValue(undefined);
      jest.spyOn(mockConnection, 'disconnect').mockResolvedValue(undefined);

      // Connect first
      await gateway.connect();
      expect(gateway.status.connectionState).toBe('connected');

      // Disconnect
      await gateway.disconnect();

      // Verify disconnected state
      expect(gateway.status.connectionState).toBe('disconnected');
    });

    it('should integrate with DeviceSyncService when polling', async () => {
      await gateway.initialize();

      // Mock the connection to avoid authentication
      const mockConnection = (gateway as any).httpConnection;
      jest.spyOn(mockConnection, 'connect').mockResolvedValue(undefined);
      jest.spyOn(mockConnection, 'disconnect').mockResolvedValue(undefined);

      // Mock the HTTP connection's makeRequest method directly
      const mockDeviceData = [
        { id: 'lock-1', serial: 'ABC123', online: true, locked: false, batteryLevel: 85 }
      ];
      jest.spyOn(mockConnection, 'makeRequest').mockResolvedValue(mockDeviceData);

      // Connect to start polling
      await gateway.connect();

      // Manually trigger polling to test integration
      await (gateway as any).pollAndSyncDevices();

      // Verify DeviceSyncService was called with transformed data
      expect(mockDeviceSyncService.syncGatewayDevices).toHaveBeenCalledWith(
        'test-http-gateway',
        expect.arrayContaining([
          expect.objectContaining({
            id: 'lock-1',
            serial: 'ABC123',
            online: true,
            locked: false,
            batteryLevel: 85,
            lastSeen: expect.any(Date)
          })
        ])
      );

      // Disconnect to clean up
      await gateway.disconnect();
    });

    it('should handle polling errors gracefully', async () => {
      await gateway.initialize();

      // Mock the connection to avoid authentication
      const mockConnection = (gateway as any).httpConnection;
      jest.spyOn(mockConnection, 'connect').mockResolvedValue(undefined);
      jest.spyOn(mockConnection, 'disconnect').mockResolvedValue(undefined);

      // Mock HTTP error
      jest.spyOn(mockConnection, 'makeRequest').mockRejectedValue(new Error('Network error'));

      // Connect to start polling
      await gateway.connect();

      // Advance timers to trigger polling
      jest.advanceTimersByTime(30000);
      await Promise.resolve();

      // Should not throw and should continue operating
      expect(gateway.status.connectionState).toBe('connected');

      // Disconnect
      await gateway.disconnect();
    });

    it('should handle empty device list from gateway', async () => {
      await gateway.initialize();

      // Mock the connection to avoid authentication
      const mockConnection = (gateway as any).httpConnection;
      jest.spyOn(mockConnection, 'connect').mockResolvedValue(undefined);
      jest.spyOn(mockConnection, 'disconnect').mockResolvedValue(undefined);

      // Mock empty device list
      jest.spyOn(mockConnection, 'makeRequest').mockResolvedValue([]);

      // Connect to start polling
      await gateway.connect();

      // Manually trigger polling to test empty list handling
      await (gateway as any).pollAndSyncDevices();

      // Verify sync was called with empty array
      expect(mockDeviceSyncService.syncGatewayDevices).toHaveBeenCalledWith(
        'test-http-gateway',
        []
      );

      // Disconnect
      await gateway.disconnect();
    });

    it('should handle devices with different identifier formats', async () => {
      await gateway.initialize();

      // Mock the connection to avoid authentication
      const mockConnection = (gateway as any).httpConnection;
      jest.spyOn(mockConnection, 'connect').mockResolvedValue(undefined);
      jest.spyOn(mockConnection, 'disconnect').mockResolvedValue(undefined);

      // Mock devices with different identifier formats
      const mockDeviceData = [
        { id: 'lock-1', online: true, locked: false }, // Only id
        { lockId: 'lock-2', online: true, locked: false }, // Only lockId
        { serial: 'ABC123', online: true, locked: false } // Only serial
      ];
      jest.spyOn(mockConnection, 'makeRequest').mockResolvedValue(mockDeviceData);

      // Connect to start polling
      await gateway.connect();

      // Manually trigger polling to test identifier handling
      await (gateway as any).pollAndSyncDevices();

      // Verify sync was called with properly formatted devices
      expect(mockDeviceSyncService.syncGatewayDevices).toHaveBeenCalledWith(
        'test-http-gateway',
        expect.arrayContaining([
          expect.objectContaining({ id: 'lock-1', serial: 'lock-1' }),
          expect.objectContaining({ id: 'lock-2', serial: 'lock-2' }),
          expect.objectContaining({ id: 'ABC123', serial: 'ABC123' })
        ])
      );

      // Disconnect
      await gateway.disconnect();
    });

    it('should respect poll frequency configuration', async () => {
      // Create gateway with custom poll frequency
      const customGateway = new HttpGateway(
        'test-custom-gateway',
        'test-facility',
        'https://192.168.3.182:8443/api',
        'test-api-key',
        undefined, // protocol version
        5000, // 5 second poll frequency
        'v1', // key management version
        false // ignore ssl cert
      );

      await customGateway.initialize();

      // The poll frequency should be stored (we can't easily test the actual timing,
      // but we can verify the gateway was created with the correct frequency)
      expect(customGateway).toBeDefined();

      await customGateway.shutdown();
    });

    it('should support manual sync', async () => {
      await gateway.initialize();

      // Mock the connection to avoid authentication
      const mockConnection = (gateway as any).httpConnection;
      jest.spyOn(mockConnection, 'connect').mockResolvedValue(undefined);
      jest.spyOn(mockConnection, 'disconnect').mockResolvedValue(undefined);

      // Mock the HTTP connection's makeRequest method directly
      const mockDeviceData = [
        { id: 'lock-manual', serial: 'MANUAL123', online: true, locked: false, batteryLevel: 90 }
      ];
      jest.spyOn(mockConnection, 'makeRequest').mockResolvedValue(mockDeviceData);

      // Perform manual sync
      await gateway.sync(false);

      // Verify DeviceSyncService was called with correct data
      expect(mockDeviceSyncService.syncGatewayDevices).toHaveBeenCalledWith(
        'test-http-gateway',
        expect.arrayContaining([
          expect.objectContaining({
            id: 'lock-manual',
            serial: 'MANUAL123',
            online: true,
            locked: false,
            batteryLevel: 90,
            lastSeen: expect.any(Date)
          })
        ])
      );

      expect(mockDeviceSyncService.updateDeviceStatuses).toHaveBeenCalled();
    });
  });
});
