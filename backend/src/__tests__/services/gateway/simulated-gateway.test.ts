import { SimulatedGateway } from '../../../services/gateway/gateways/simulated.gateway';
import { GatewayConnectionState, DeviceType, ProtocolVersion } from '../../../types/gateway.types';
import { DeviceSyncService } from '../../../services/device-sync.service';

// Mock DeviceSyncService
jest.mock('../../../services/device-sync.service');

describe('SimulatedGateway', () => {
  let gateway: SimulatedGateway;

  beforeEach(() => {
    gateway = new SimulatedGateway('test-gateway', 'test-facility');
  });

  afterEach(async () => {
    if (gateway) {
      await gateway.shutdown().catch(() => {});
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await expect(gateway.initialize()).resolves.toBeUndefined();
      expect(gateway.status.id).toBe('test-gateway');
      expect(gateway.facilityId).toBe('test-facility');
    });

    it('should have correct capabilities', () => {
      const capabilities = gateway.capabilities;
      expect(capabilities.supportedProtocols).toContain(ProtocolVersion.SIMULATED);
      expect(capabilities.maxConnections).toBe(1);
      expect(capabilities.supportedDeviceTypes).toContain(DeviceType.LOCK);
      expect(capabilities.firmwareUpdateSupport).toBe(true);
    });
  });

  describe('Connection Management', () => {
    beforeEach(async () => {
      await gateway.initialize();
    });

    it('should connect successfully', async () => {
      await expect(gateway.connect()).resolves.toBeUndefined();
      expect(gateway.status.connectionState).toBe(GatewayConnectionState.CONNECTED);
    });

    it('should disconnect successfully', async () => {
      await gateway.connect();
      await expect(gateway.disconnect()).resolves.toBeUndefined();
      expect(gateway.status.connectionState).toBe(GatewayConnectionState.DISCONNECTED);
    });
  });

  describe('Device Management', () => {
    beforeEach(async () => {
      await gateway.initialize();
      await gateway.connect();
    });

    it('should register device successfully', async () => {
      const deviceInfo = {
        id: 'test-device',
        type: DeviceType.LOCK,
        model: 'TestLock-100',
        serialNumber: 'TL100-001',
        firmwareVersion: '1.0.0',
        hardwareRevision: '1.0',
        installedAt: new Date(),
        configuration: {},
      };

      await expect(gateway.registerDevice(deviceInfo)).resolves.toBeUndefined();
      expect(gateway.status.deviceCount).toBe(1);
    });

    it('should unregister device successfully', async () => {
      const deviceInfo = {
        id: 'test-device',
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

      await expect(gateway.unregisterDevice('test-device')).resolves.toBeUndefined();
      expect(gateway.status.deviceCount).toBe(0);
    });

    it('should get device status', async () => {
      const deviceInfo = {
        id: 'test-device',
        type: DeviceType.LOCK,
        model: 'TestLock-100',
        serialNumber: 'TL100-001',
        firmwareVersion: '1.0.0',
        hardwareRevision: '1.0',
        installedAt: new Date(),
        configuration: {},
      };

      await gateway.registerDevice(deviceInfo);
      const status = await gateway.getDeviceStatus('test-device');

      expect(status).toHaveProperty('id', 'test-device');
      expect(status).toHaveProperty('connectionState');
      expect(status).toHaveProperty('batteryLevel');
      expect(status.hasError).toBeDefined();
    });

    it('should execute device commands', async () => {
      const deviceInfo = {
        id: 'test-device',
        type: DeviceType.LOCK,
        model: 'TestLock-100',
        serialNumber: 'TL100-001',
        firmwareVersion: '1.0.0',
        hardwareRevision: '1.0',
        installedAt: new Date(),
        configuration: {},
      };

      await gateway.registerDevice(deviceInfo);
      const result = await gateway.executeDeviceCommand('test-device', 'lock');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('executedAt');
      expect(result).toHaveProperty('duration');
    });
  });

  describe('Device Synchronization', () => {
    let mockDeviceSyncService: jest.Mocked<DeviceSyncService>;

    beforeEach(() => {
      // Create fresh mock DeviceSyncService instance for each test
      mockDeviceSyncService = {
        syncGatewayDevices: jest.fn(),
        updateDeviceStatuses: jest.fn(),
      } as any;

      // Mock the singleton getter
      (DeviceSyncService.getInstance as jest.Mock).mockReturnValue(mockDeviceSyncService);
    });

    it('should sync simulated devices', async () => {
      // Register a simulated device
      await gateway.registerDevice({
        id: 'sim-device-1',
        type: DeviceType.LOCK,
        model: 'SimLock-100',
        serialNumber: 'SIM001',
        firmwareVersion: '1.0.0',
        hardwareRevision: '1.0',
        installedAt: new Date(),
        configuration: {},
      });

      // Perform sync
      await gateway.sync(false);

      // Verify DeviceSyncService was called with simulated device data
      expect(mockDeviceSyncService.syncGatewayDevices).toHaveBeenCalledWith(
        'test-gateway',
        expect.arrayContaining([
          expect.objectContaining({
            id: 'sim-device-1',
            serial: 'sim-device-1', // Uses deviceId as fallback when serial not set
            online: true,
            locked: false, // default state
            batteryLevel: 85,
            lastSeen: expect.any(Date)
          })
        ])
      );

      expect(mockDeviceSyncService.updateDeviceStatuses).toHaveBeenCalledWith(
        'test-gateway',
        expect.any(Array)
      );
    });

    it('should handle empty simulated device list', async () => {
      // Perform sync with no devices
      await gateway.sync(false);

      // Should still call sync with empty array
      expect(mockDeviceSyncService.syncGatewayDevices).toHaveBeenCalledWith(
        'test-gateway',
        []
      );
    });
  });

  describe('Simulated Features', () => {
    it('should provide simulated device access', () => {
      const simGateway = gateway as any;
      expect(simGateway.getSimulatedDevices).toBeDefined();
      expect(simGateway.reset).toBeDefined();
    });
  });
});
