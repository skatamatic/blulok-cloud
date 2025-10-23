import { BaseGateway } from '../../../services/gateway/gateways/base.gateway';
import { DeviceSyncService } from '../../../services/device-sync.service';
import { ProtocolVersion, DeviceType } from '../../../types/gateway.types';

// Mock dependencies
jest.mock('../../../services/device-sync.service');

// Create a concrete implementation of BaseGateway for testing
class TestGateway extends BaseGateway {
  constructor(id: string, facilityId: string) {
    super(id, facilityId);
  }

  get capabilities() {
    return {
      supportedProtocols: [ProtocolVersion.V1_0, ProtocolVersion.V1_1],
      maxConnections: 1,
      supportedDeviceTypes: [DeviceType.LOCK],
      firmwareUpdateSupport: false,
      remoteAccessSupport: true,
      keyManagementSupport: true,
      heartbeatInterval: 30000,
    };
  }

  // Expose protected method for testing
  public testSyncDeviceData(deviceData: any[]) {
    return this.syncDeviceData(deviceData);
  }

  protected createProtocol() {
    // Mock implementation
    return {} as any;
  }

  protected createConnection() {
    // Mock implementation
    return {} as any;
  }

  protected sendDeviceRegistration(_deviceInfo: any) {
    // Mock implementation
    return Promise.resolve();
  }

  protected sendDeviceUnregistration(_deviceId: string) {
    // Mock implementation
    return Promise.resolve();
  }
}

describe('BaseGateway', () => {
  let gateway: TestGateway;
  let mockDeviceSyncService: jest.Mocked<DeviceSyncService>;

  beforeEach(() => {
    // Create mock instance
    mockDeviceSyncService = {
      syncGatewayDevices: jest.fn(),
      updateDeviceStatuses: jest.fn(),
    } as any;

    // Mock the singleton getter
    (DeviceSyncService.getInstance as jest.Mock).mockReturnValue(mockDeviceSyncService);

    gateway = new TestGateway('test-gateway', 'test-facility');
  });

  afterEach(async () => {
    await gateway.shutdown();
  });

  describe('syncDeviceData', () => {
    it('should call DeviceSyncService with gateway device data', async () => {
      const mockDeviceData = [
        {
          id: 'lock-1',
          serial: 'ABC123',
          online: true,
          locked: false,
          batteryLevel: 85,
          lastSeen: new Date()
        },
        {
          id: 'lock-2',
          serial: 'DEF456',
          online: false,
          locked: true,
          batteryLevel: 72,
          lastSeen: new Date()
        }
      ];

      // Call syncDeviceData
      await gateway.testSyncDeviceData(mockDeviceData);

      // Verify DeviceSyncService was called correctly
      expect(mockDeviceSyncService.syncGatewayDevices).toHaveBeenCalledWith(
        'test-gateway',
        mockDeviceData
      );

      expect(mockDeviceSyncService.updateDeviceStatuses).toHaveBeenCalledWith(
        'test-gateway',
        mockDeviceData
      );
    });

    it('should handle empty device data array', async () => {
      const mockDeviceData: any[] = [];

      await gateway.testSyncDeviceData(mockDeviceData);

      expect(mockDeviceSyncService.syncGatewayDevices).toHaveBeenCalledWith(
        'test-gateway',
        []
      );

      expect(mockDeviceSyncService.updateDeviceStatuses).toHaveBeenCalledWith(
        'test-gateway',
        []
      );
    });

    it('should handle sync errors gracefully', async () => {
      const mockDeviceData = [
        {
          id: 'lock-1',
          serial: 'ABC123',
          online: true,
          locked: false
        }
      ];

      // Mock sync failure
      mockDeviceSyncService.syncGatewayDevices.mockRejectedValue(
        new Error('Database connection failed')
      );

      // Should not throw
      await expect(gateway.testSyncDeviceData(mockDeviceData)).resolves.not.toThrow();

      // Should still attempt status updates even if sync fails
      expect(mockDeviceSyncService.updateDeviceStatuses).toHaveBeenCalledWith(
        'test-gateway',
        mockDeviceData
      );
    });

    it('should handle status update errors gracefully', async () => {
      const mockDeviceData = [
        {
          id: 'lock-1',
          serial: 'ABC123',
          online: true,
          locked: false
        }
      ];

      // Mock status update failure
      mockDeviceSyncService.updateDeviceStatuses.mockRejectedValue(
        new Error('Status update failed')
      );

      // Should not throw
      await expect(gateway.testSyncDeviceData(mockDeviceData)).resolves.not.toThrow();

      // Should still attempt sync even if status updates fail
      expect(mockDeviceSyncService.syncGatewayDevices).toHaveBeenCalledWith(
        'test-gateway',
        mockDeviceData
      );
    });

    it('should handle both sync and status update errors gracefully', async () => {
      const mockDeviceData = [
        {
          id: 'lock-1',
          serial: 'ABC123',
          online: true,
          locked: false
        }
      ];

      // Mock both operations failing
      mockDeviceSyncService.syncGatewayDevices.mockRejectedValue(
        new Error('Sync failed')
      );
      mockDeviceSyncService.updateDeviceStatuses.mockRejectedValue(
        new Error('Status update failed')
      );

      // Should not throw despite both operations failing
      await expect(gateway.testSyncDeviceData(mockDeviceData)).resolves.not.toThrow();

      // Should still attempt both operations
      expect(mockDeviceSyncService.syncGatewayDevices).toHaveBeenCalledWith(
        'test-gateway',
        mockDeviceData
      );
      expect(mockDeviceSyncService.updateDeviceStatuses).toHaveBeenCalledWith(
        'test-gateway',
        mockDeviceData
      );
    });
  });
});
