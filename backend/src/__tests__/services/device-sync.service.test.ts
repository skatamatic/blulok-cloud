import { DeviceSyncService, GatewayDeviceData } from '../../../src/services/device-sync.service';
import { DeviceModel, DeviceWithContext } from '../../../src/models/device.model';
import { DeviceEventService } from '../../../src/services/device-event.service';

// Mock dependencies
jest.mock('../../../src/models/device.model');
jest.mock('../../../src/services/device-event.service');

// Helper function to create DeviceWithContext objects
const createDeviceWithContext = (overrides: Partial<DeviceWithContext> = {}): DeviceWithContext => ({
  id: 'device-1',
  gateway_id: 'gateway-123',
  unit_id: 'unit-1',
  device_serial: 'ABC123',
  firmware_version: '1.0.0',
  lock_status: 'unlocked',
  device_status: 'online',
  battery_level: 85,
  last_activity: new Date(),
  last_seen: new Date(),
  device_settings: {},
  metadata: {},
  created_at: new Date(),
  updated_at: new Date(),
  unit_number: '101',
  unit_type: 'apartment',
  facility_name: 'Test Facility',
  gateway_name: 'Test Gateway',
  // primary_tenant is optional and defaults to undefined
  ...overrides
});

describe('DeviceSyncService', () => {
  let deviceSyncService: DeviceSyncService;
  let mockDeviceModel: jest.Mocked<DeviceModel>;
  let mockEventService: jest.Mocked<DeviceEventService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    mockDeviceModel = {
      findBluLokDevices: jest.fn(),
      createBluLokDevice: jest.fn(),
      updateDeviceStatus: jest.fn(),
      updateLockStatus: jest.fn(),
      updateBatteryLevel: jest.fn(),
      deleteBluLokDevice: jest.fn(),
      updateBluLokDeviceState: jest.fn(),
      findBluLokDeviceByIdOrSerial: jest.fn(),
    } as any;

    mockEventService = {
      emitDeviceAdded: jest.fn(),
      emitDeviceRemoved: jest.fn(),
      emitDeviceStatusChanged: jest.fn(),
      emitLockStatusChanged: jest.fn(),
    } as any;

    // Mock the constructors and singleton getters
    (DeviceModel as jest.Mock).mockImplementation(() => mockDeviceModel);
    (DeviceEventService.getInstance as jest.Mock).mockReturnValue(mockEventService);

    // Create a new instance for each test to ensure clean state
    deviceSyncService = new DeviceSyncService(mockDeviceModel, mockEventService);
  });

  describe('syncGatewayDevices', () => {
    const gatewayId = 'gateway-123';

    it('should add new devices from gateway', async () => {
      // Setup
      const existingDevices: DeviceWithContext[] = [];
      const gatewayDevices: GatewayDeviceData[] = [
        {
          id: 'lock-1',
          serial: 'ABC123',
          online: true,
          locked: false,
          batteryLevel: 85
        }
      ];

      mockDeviceModel.findBluLokDevices.mockResolvedValue(existingDevices);
      mockDeviceModel.createBluLokDevice.mockResolvedValue({
        id: 'device-1',
        device_serial: 'ABC123'
      } as any);

      // Execute
      await deviceSyncService.syncGatewayDevices(gatewayId, gatewayDevices);

      // Verify
      expect(mockDeviceModel.findBluLokDevices).toHaveBeenCalledWith({
        gateway_id: gatewayId
      });
      expect(mockDeviceModel.createBluLokDevice).toHaveBeenCalledWith({
        gateway_id: gatewayId,
        device_serial: 'ABC123',
        device_settings: { gatewayData: gatewayDevices[0] },
        metadata: {
          autoCreated: true,
          createdFromGatewaySync: true,
          gatewayType: 'http'
        }
      });
    });

    it('should remove devices no longer on gateway', async () => {
      // Setup
      const existingDevices: DeviceWithContext[] = [
        createDeviceWithContext({
          id: 'device-1',
          device_serial: 'ABC123',
          gateway_id: gatewayId
        })
      ];
      const gatewayDevices: GatewayDeviceData[] = []; // No devices on gateway

      mockDeviceModel.findBluLokDevices.mockResolvedValue(existingDevices);

      // Execute
      await deviceSyncService.syncGatewayDevices(gatewayId, gatewayDevices);

      // Verify
      expect(mockDeviceModel.deleteBluLokDevice).toHaveBeenCalledWith('device-1');
      expect(mockEventService.emitDeviceRemoved).toHaveBeenCalledWith({
        deviceId: 'device-1',
        deviceType: 'blulok',
        gatewayId: gatewayId
      });
    });

    it('should handle mixed add/remove/update scenarios', async () => {
      // Setup
      const existingDevices: DeviceWithContext[] = [
        createDeviceWithContext({
          id: 'device-1',
          device_serial: 'ABC123',
          gateway_id: gatewayId
        }),
        createDeviceWithContext({
          id: 'device-2',
          device_serial: 'DEF456',
          gateway_id: gatewayId
        })
      ];

      const gatewayDevices: GatewayDeviceData[] = [
        // ABC123 - stays (update)
        {
          id: 'lock-1',
          serial: 'ABC123',
          online: true,
          locked: false,
          batteryLevel: 85
        },
        // GHI789 - new device (add)
        {
          id: 'lock-2',
          serial: 'GHI789',
          online: true,
          locked: true,
          batteryLevel: 92
        }
        // DEF456 - removed (not in gateway devices)
      ];

      mockDeviceModel.findBluLokDevices.mockResolvedValue(existingDevices);
      mockDeviceModel.createBluLokDevice.mockResolvedValue({
        id: 'device-3',
        device_serial: 'GHI789'
      } as any);

      // Execute
      await deviceSyncService.syncGatewayDevices(gatewayId, gatewayDevices);

      // Verify
      expect(mockDeviceModel.createBluLokDevice).toHaveBeenCalledTimes(1);
      expect(mockDeviceModel.deleteBluLokDevice).toHaveBeenCalledTimes(1);
      expect(mockDeviceModel.deleteBluLokDevice).toHaveBeenCalledWith('device-2');
    });

    it('should handle devices with different identifier formats', async () => {
      // Setup
      const existingDevices: DeviceWithContext[] = [];
      const gatewayDevices: GatewayDeviceData[] = [
        { id: 'lock-1', online: true, locked: false }, // Only id
        { lockId: 'lock-2', online: true, locked: false }, // Only lockId
        { serial: 'ABC123', online: true, locked: false } // Only serial
      ];

      mockDeviceModel.findBluLokDevices.mockResolvedValue(existingDevices);
      mockDeviceModel.createBluLokDevice
        .mockResolvedValueOnce({ id: 'device-1', device_serial: 'lock-1' } as any)
        .mockResolvedValueOnce({ id: 'device-2', device_serial: 'lock-2' } as any)
        .mockResolvedValueOnce({ id: 'device-3', device_serial: 'ABC123' } as any);

      // Execute
      await deviceSyncService.syncGatewayDevices(gatewayId, gatewayDevices);

      // Verify all three devices were created
      expect(mockDeviceModel.createBluLokDevice).toHaveBeenCalledTimes(3);
      expect(mockDeviceModel.createBluLokDevice).toHaveBeenNthCalledWith(1, expect.objectContaining({
        device_serial: 'lock-1'
      }));
      expect(mockDeviceModel.createBluLokDevice).toHaveBeenNthCalledWith(2, expect.objectContaining({
        device_serial: 'lock-2'
      }));
      expect(mockDeviceModel.createBluLokDevice).toHaveBeenNthCalledWith(3, expect.objectContaining({
        device_serial: 'ABC123'
      }));
    });

    it('should skip devices without valid identifiers', async () => {
      // Setup
      const existingDevices: DeviceWithContext[] = [];
      const gatewayDevices: GatewayDeviceData[] = [
        { online: true, locked: false }, // No identifiers
        { id: 'valid-id', serial: 'ABC123', online: true, locked: false } // Valid
      ];

      mockDeviceModel.findBluLokDevices.mockResolvedValue(existingDevices);
      mockDeviceModel.createBluLokDevice.mockResolvedValue({
        id: 'device-1',
        device_serial: 'ABC123'
      } as any);

      // Execute
      await deviceSyncService.syncGatewayDevices(gatewayId, gatewayDevices);

      // Verify only the valid device was created
      expect(mockDeviceModel.createBluLokDevice).toHaveBeenCalledTimes(1);
      expect(mockDeviceModel.createBluLokDevice).toHaveBeenCalledWith(expect.objectContaining({
        device_serial: 'ABC123'
      }));
    });
  });

  describe('updateDeviceStatuses', () => {
    const gatewayId = 'gateway-123';

    it('should update device status when changed', async () => {
      // Setup
      const existingDevices: DeviceWithContext[] = [
        createDeviceWithContext({
          id: 'device-1',
          device_serial: 'ABC123',
          device_status: 'offline',
          lock_status: 'unlocked',
          battery_level: 50
        })
      ];

      const gatewayDevices: GatewayDeviceData[] = [
        {
          serial: 'ABC123',
          online: true, // Changed from offline
          locked: false, // Same
          batteryLevel: 75 // Changed
        }
      ];

      mockDeviceModel.findBluLokDevices.mockResolvedValue(existingDevices);

      // Execute
      await deviceSyncService.updateDeviceStatuses(gatewayId, gatewayDevices);

      // Verify
      expect(mockDeviceModel.updateDeviceStatus).toHaveBeenCalledWith('device-1', 'blulok', 'online');
      expect(mockDeviceModel.updateBatteryLevel).toHaveBeenCalledWith('device-1', 75);
      expect(mockDeviceModel.updateLockStatus).not.toHaveBeenCalled(); // Lock status didn't change
    });

    it('should update lock status when changed', async () => {
      // Setup
      const existingDevices: DeviceWithContext[] = [
        createDeviceWithContext({
          id: 'device-1',
          device_serial: 'ABC123',
          device_status: 'online',
          lock_status: 'unlocked',
          battery_level: 80
        })
      ];

      const gatewayDevices: GatewayDeviceData[] = [
        {
          serial: 'ABC123',
          online: true, // Same
          locked: true // Changed from unlocked
        }
      ];

      mockDeviceModel.findBluLokDevices.mockResolvedValue(existingDevices);

      // Execute
      await deviceSyncService.updateDeviceStatuses(gatewayId, gatewayDevices);

      // Verify
      expect(mockDeviceModel.updateLockStatus).toHaveBeenCalledWith('device-1', 'locked');
      expect(mockDeviceModel.updateDeviceStatus).not.toHaveBeenCalled(); // Device status didn't change
      expect(mockDeviceModel.updateBatteryLevel).not.toHaveBeenCalled(); // Battery not provided
    });

    it('should skip battery update when not provided', async () => {
      // Setup
      const existingDevices: DeviceWithContext[] = [
        createDeviceWithContext({
          id: 'device-1',
          device_serial: 'ABC123',
          device_status: 'online',
          lock_status: 'unlocked',
          battery_level: 80
        })
      ];

      const gatewayDevices: GatewayDeviceData[] = [
        {
          serial: 'ABC123',
          online: true,
          locked: false
          // batteryLevel not provided
        }
      ];

      mockDeviceModel.findBluLokDevices.mockResolvedValue(existingDevices);

      // Execute
      await deviceSyncService.updateDeviceStatuses(gatewayId, gatewayDevices);

      // Verify
      expect(mockDeviceModel.updateBatteryLevel).not.toHaveBeenCalled();
      expect(mockDeviceModel.updateDeviceStatus).not.toHaveBeenCalled();
      expect(mockDeviceModel.updateLockStatus).not.toHaveBeenCalled();
    });

    it('should handle multiple devices with mixed updates', async () => {
      // Setup
      const existingDevices: DeviceWithContext[] = [
        createDeviceWithContext({
          id: 'device-1',
          device_serial: 'ABC123',
          device_status: 'online',
          lock_status: 'unlocked',
          battery_level: 80
        }),
        createDeviceWithContext({
          id: 'device-2',
          device_serial: 'DEF456',
          device_status: 'offline',
          lock_status: 'locked',
          battery_level: 60
        })
      ];

      const gatewayDevices: GatewayDeviceData[] = [
        {
          serial: 'ABC123',
          online: false, // Changed
          locked: true, // Changed
          batteryLevel: 75 // Changed
        },
        {
          serial: 'DEF456',
          online: true, // Changed
          locked: false, // Changed
          batteryLevel: 60 // Same
        }
      ];

      mockDeviceModel.findBluLokDevices.mockResolvedValue(existingDevices);

      // Execute
      await deviceSyncService.updateDeviceStatuses(gatewayId, gatewayDevices);

      // Verify device 1 updates
      expect(mockDeviceModel.updateDeviceStatus).toHaveBeenCalledWith('device-1', 'blulok', 'offline');
      expect(mockDeviceModel.updateLockStatus).toHaveBeenCalledWith('device-1', 'locked');
      expect(mockDeviceModel.updateBatteryLevel).toHaveBeenCalledWith('device-1', 75);

      // Verify device 2 updates (battery same so not updated)
      expect(mockDeviceModel.updateDeviceStatus).toHaveBeenCalledWith('device-2', 'blulok', 'online');
      expect(mockDeviceModel.updateLockStatus).toHaveBeenCalledWith('device-2', 'unlocked');
      // Battery level same, so not updated
    });

    it('should handle devices not found in gateway data', async () => {
      // Setup
      const existingDevices: DeviceWithContext[] = [
        createDeviceWithContext({
          id: 'device-1',
          device_serial: 'ABC123',
          device_status: 'online',
          lock_status: 'unlocked'
        })
      ];

      const gatewayDevices: GatewayDeviceData[] = [
        // ABC123 not in gateway data
      ];

      mockDeviceModel.findBluLokDevices.mockResolvedValue(existingDevices);

      // Execute
      await deviceSyncService.updateDeviceStatuses(gatewayId, gatewayDevices);

      // Verify no updates since device not in gateway data
      expect(mockDeviceModel.updateDeviceStatus).not.toHaveBeenCalled();
      expect(mockDeviceModel.updateLockStatus).not.toHaveBeenCalled();
      expect(mockDeviceModel.updateBatteryLevel).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle errors when creating devices', async () => {
      // Setup
      const existingDevices: DeviceWithContext[] = [];
      const gatewayDevices: GatewayDeviceData[] = [
        {
          id: 'lock-1',
          serial: 'ABC123',
          online: true,
          locked: false
        }
      ];

      mockDeviceModel.findBluLokDevices.mockResolvedValue(existingDevices);
      mockDeviceModel.createBluLokDevice.mockRejectedValue(new Error('Database error'));

      // Execute - should not throw
      await expect(deviceSyncService.syncGatewayDevices('gateway-123', gatewayDevices)).resolves.not.toThrow();

      // Verify device was attempted to be created
      expect(mockDeviceModel.createBluLokDevice).toHaveBeenCalled();
    });

    it('should handle errors when deleting devices', async () => {
      // Setup
      const existingDevices: DeviceWithContext[] = [
        createDeviceWithContext({
          id: 'device-1',
          device_serial: 'ABC123',
          gateway_id: 'gateway-123'
        })
      ];
      const gatewayDevices: GatewayDeviceData[] = [];

      mockDeviceModel.findBluLokDevices.mockResolvedValue(existingDevices);
      mockDeviceModel.deleteBluLokDevice.mockRejectedValue(new Error('Database error'));

      // Execute - should not throw
      await expect(deviceSyncService.syncGatewayDevices('gateway-123', gatewayDevices)).resolves.not.toThrow();

      // Verify delete was attempted
      expect(mockDeviceModel.deleteBluLokDevice).toHaveBeenCalledWith('device-1');
    });

    it('should handle errors when updating device status', async () => {
      // Setup
      const existingDevices: DeviceWithContext[] = [
        createDeviceWithContext({
          id: 'device-1',
          device_serial: 'ABC123',
          device_status: 'offline'
        })
      ];

      const gatewayDevices: GatewayDeviceData[] = [
        {
          serial: 'ABC123',
          online: true
        }
      ];

      mockDeviceModel.findBluLokDevices.mockResolvedValue(existingDevices);
      mockDeviceModel.updateDeviceStatus.mockRejectedValue(new Error('Database error'));

      // Execute - should not throw
      await expect(deviceSyncService.updateDeviceStatuses('gateway-123', gatewayDevices)).resolves.not.toThrow();

      // Verify update was attempted
      expect(mockDeviceModel.updateDeviceStatus).toHaveBeenCalledWith('device-1', 'blulok', 'online');
    });
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = DeviceSyncService.getInstance();
      const instance2 = DeviceSyncService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  // ============================================================================
  // NEW METHODS TESTS
  // ============================================================================

  describe('syncDeviceInventory', () => {
    const gatewayId = 'gateway-123';

    it('should add new devices from inventory', async () => {
      mockDeviceModel.findBluLokDevices.mockResolvedValue([]);
      mockDeviceModel.createBluLokDevice.mockResolvedValue({ id: 'device-1', device_serial: 'LOCK-1' } as any);

      const result = await deviceSyncService.syncDeviceInventory(gatewayId, [
        { lock_id: 'LOCK-1', lock_number: 101, firmware_version: '1.0.0' },
      ]);

      expect(result.added).toBe(1);
      expect(result.removed).toBe(0);
      expect(result.unchanged).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockDeviceModel.createBluLokDevice).toHaveBeenCalledWith({
        gateway_id: gatewayId,
        device_serial: 'LOCK-1',
        device_settings: { lockNumber: 101 },
        metadata: { autoCreated: true, createdFromInventorySync: true },
        firmware_version: '1.0.0',
      });
    });

    it('should remove devices not in inventory', async () => {
      mockDeviceModel.findBluLokDevices.mockResolvedValue([
        createDeviceWithContext({ id: 'device-1', device_serial: 'LOCK-1' }),
        createDeviceWithContext({ id: 'device-2', device_serial: 'LOCK-2' }),
      ]);
      mockDeviceModel.deleteBluLokDevice.mockResolvedValue(undefined);

      const result = await deviceSyncService.syncDeviceInventory(gatewayId, [
        { lock_id: 'LOCK-1' },
      ]);

      expect(result.added).toBe(0);
      expect(result.removed).toBe(1);
      expect(result.unchanged).toBe(1);
      expect(mockDeviceModel.deleteBluLokDevice).toHaveBeenCalledWith('device-2');
    });

    it('should update firmware_version for existing devices', async () => {
      mockDeviceModel.findBluLokDevices.mockResolvedValue([
        createDeviceWithContext({ id: 'device-1', device_serial: 'LOCK-1', firmware_version: '1.0.0' }),
      ]);
      mockDeviceModel.updateBluLokDeviceState.mockResolvedValue(true);

      const result = await deviceSyncService.syncDeviceInventory(gatewayId, [
        { lock_id: 'LOCK-1', firmware_version: '2.0.0' },
      ]);

      expect(result.unchanged).toBe(1);
      expect(mockDeviceModel.updateBluLokDeviceState).toHaveBeenCalledWith('device-1', {
        firmware_version: '2.0.0',
      });
    });

    it('should handle empty inventory (removes all devices)', async () => {
      mockDeviceModel.findBluLokDevices.mockResolvedValue([
        createDeviceWithContext({ id: 'device-1', device_serial: 'LOCK-1' }),
      ]);
      mockDeviceModel.deleteBluLokDevice.mockResolvedValue(undefined);

      const result = await deviceSyncService.syncDeviceInventory(gatewayId, []);

      expect(result.removed).toBe(1);
      expect(mockDeviceModel.deleteBluLokDevice).toHaveBeenCalled();
    });

    it('should remove device that is assigned to a unit', async () => {
      // Device assigned to a unit should be removable
      const deviceWithUnit = createDeviceWithContext({
        id: 'device-1',
        device_serial: 'LOCK-1',
        unit_id: 'unit-123',
      });

      mockDeviceModel.findBluLokDevices.mockResolvedValue([deviceWithUnit]);
      mockDeviceModel.deleteBluLokDevice.mockResolvedValue(undefined);

      const result = await deviceSyncService.syncDeviceInventory(gatewayId, []);

      expect(result.removed).toBe(1);
      expect(mockDeviceModel.deleteBluLokDevice).toHaveBeenCalledWith('device-1');
      // Verify device removed event is emitted
      expect(mockEventService.emitDeviceRemoved).toHaveBeenCalledWith({
        deviceId: 'device-1',
        deviceType: 'blulok',
        gatewayId: gatewayId,
      });
    });

    it('should remove multiple devices including ones with unit assignments', async () => {
      const devices = [
        createDeviceWithContext({ id: 'device-1', device_serial: 'LOCK-1', unit_id: null }),
        createDeviceWithContext({ id: 'device-2', device_serial: 'LOCK-2', unit_id: 'unit-123' }),
        createDeviceWithContext({ id: 'device-3', device_serial: 'LOCK-3', unit_id: 'unit-456' }),
      ];

      mockDeviceModel.findBluLokDevices.mockResolvedValue(devices);
      mockDeviceModel.deleteBluLokDevice.mockResolvedValue(undefined);

      // Keep only LOCK-1, remove others
      const result = await deviceSyncService.syncDeviceInventory(gatewayId, [
        { lock_id: 'LOCK-1' },
      ]);

      expect(result.removed).toBe(2);
      expect(result.unchanged).toBe(1);
      expect(mockDeviceModel.deleteBluLokDevice).toHaveBeenCalledTimes(2);
      expect(mockDeviceModel.deleteBluLokDevice).toHaveBeenCalledWith('device-2');
      expect(mockDeviceModel.deleteBluLokDevice).toHaveBeenCalledWith('device-3');
      // Both devices should emit removal events
      expect(mockEventService.emitDeviceRemoved).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateDeviceStates', () => {
    const gatewayId = 'gateway-123';

    it('should update lock_state to lock_status', async () => {
      mockDeviceModel.updateBluLokDeviceState.mockResolvedValue(true);

      const result = await deviceSyncService.updateDeviceStates(gatewayId, [
        { lock_id: 'LOCK-1', lock_state: 'LOCKED' },
      ]);

      expect(result.updated).toBe(1);
      expect(result.not_found).toHaveLength(0);
      expect(mockDeviceModel.updateBluLokDeviceState).toHaveBeenCalledWith('LOCK-1', {
        lock_status: 'locked',
      });
    });

    it('should update online to device_status', async () => {
      mockDeviceModel.updateBluLokDeviceState.mockResolvedValue(true);

      const result = await deviceSyncService.updateDeviceStates(gatewayId, [
        { lock_id: 'LOCK-1', online: true },
      ]);

      expect(result.updated).toBe(1);
      expect(mockDeviceModel.updateBluLokDeviceState).toHaveBeenCalledWith('LOCK-1', {
        device_status: 'online',
      });
    });

    it('should update multiple fields at once', async () => {
      mockDeviceModel.updateBluLokDeviceState.mockResolvedValue(true);

      const result = await deviceSyncService.updateDeviceStates(gatewayId, [
        {
          lock_id: 'LOCK-1',
          lock_state: 'UNLOCKED',
          battery_level: 85,
          online: true,
          signal_strength: -65,
          temperature: 22.5,
        },
      ]);

      expect(result.updated).toBe(1);
      expect(mockDeviceModel.updateBluLokDeviceState).toHaveBeenCalledWith('LOCK-1', {
        lock_status: 'unlocked',
        device_status: 'online',
        battery_level: 85,
        signal_strength: -65,
        temperature: 22.5,
      });
    });

    it('should track not_found devices', async () => {
      mockDeviceModel.updateBluLokDeviceState.mockResolvedValue(false);

      const result = await deviceSyncService.updateDeviceStates(gatewayId, [
        { lock_id: 'UNKNOWN-LOCK', battery_level: 50 },
      ]);

      expect(result.updated).toBe(0);
      expect(result.not_found).toContain('UNKNOWN-LOCK');
    });

    it('should handle batch updates', async () => {
      mockDeviceModel.updateBluLokDeviceState
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const result = await deviceSyncService.updateDeviceStates(gatewayId, [
        { lock_id: 'LOCK-1', battery_level: 85 },
        { lock_id: 'LOCK-2', battery_level: 70 },
        { lock_id: 'UNKNOWN', battery_level: 50 },
      ]);

      expect(result.updated).toBe(2);
      expect(result.not_found).toContain('UNKNOWN');
    });

    it('should handle error_code and error_message', async () => {
      mockDeviceModel.updateBluLokDeviceState.mockResolvedValue(true);

      const result = await deviceSyncService.updateDeviceStates(gatewayId, [
        { lock_id: 'LOCK-1', lock_state: 'ERROR', error_code: 'E001', error_message: 'Motor stuck' },
      ]);

      expect(result.updated).toBe(1);
      expect(mockDeviceModel.updateBluLokDeviceState).toHaveBeenCalledWith('LOCK-1', {
        lock_status: 'error',
        error_code: 'E001',
        error_message: 'Motor stuck',
      });
    });

    it('should convert last_seen string to Date', async () => {
      mockDeviceModel.updateBluLokDeviceState.mockResolvedValue(true);

      const result = await deviceSyncService.updateDeviceStates(gatewayId, [
        { lock_id: 'LOCK-1', last_seen: '2025-12-10T14:30:00.000Z' },
      ]);

      expect(result.updated).toBe(1);
      const call = mockDeviceModel.updateBluLokDeviceState.mock.calls[0];
      expect(call[1].last_seen).toBeInstanceOf(Date);
    });

    it('should skip updates with no actual fields', async () => {
      const result = await deviceSyncService.updateDeviceStates(gatewayId, [
        { lock_id: 'LOCK-1' }, // No actual state fields
      ]);

      expect(result.updated).toBe(0);
      expect(mockDeviceModel.updateBluLokDeviceState).not.toHaveBeenCalled();
    });
  });
});
