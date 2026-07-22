import { DeviceSyncService, GatewayDeviceData } from '../../../src/services/device-sync.service';
import { AccessControlDevice, DeviceModel, DeviceWithContext } from '../../../src/models/device.model';
import { DeviceEventService } from '../../../src/services/device-event.service';

const mockDeleteBluLokFromInventory = jest.fn().mockResolvedValue({
  gatewayId: 'gateway-123',
  facilityId: 'facility-1',
  hadUnit: false,
  unitId: null,
});

const mockDeleteAccessControlFromInventory = jest.fn().mockResolvedValue({
  gatewayId: 'gateway-123',
  facilityId: 'facility-1',
  accessId: 'KP-001',
  relayChannel: 1,
});

// Mock dependencies
jest.mock('../../../src/models/device.model');
jest.mock('../../../src/services/device-event.service');
jest.mock('../../../src/services/devices.service', () => ({
  DevicesService: {
    getInstance: jest.fn(() => ({
      deleteBluLokFromInventory: mockDeleteBluLokFromInventory,
      deleteAccessControlFromInventory: mockDeleteAccessControlFromInventory,
    })),
  },
}));

const mockPushCodesToGateway = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../src/services/access-code.service', () => ({
  AccessCodeService: {
    getInstance: jest.fn(() => ({
      pushCodesToGateway: mockPushCodesToGateway,
    })),
  },
}));

const mockEnsureDefaultGroup = jest.fn().mockResolvedValue({ id: 'default-group-1' });
const mockAssignAccessControlToDefaultGroup = jest.fn().mockResolvedValue(undefined);
const mockAssignBluLokToDefaultGroup = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../src/services/device-group.service', () => ({
  DeviceGroupService: {
    getInstance: jest.fn(() => ({
      ensureDefaultGroup: (...args: unknown[]) => mockEnsureDefaultGroup(...args),
      assignAccessControlToDefaultGroup: (...args: unknown[]) =>
        mockAssignAccessControlToDefaultGroup(...args),
      assignBluLokToDefaultGroup: (...args: unknown[]) =>
        mockAssignBluLokToDefaultGroup(...args),
    })),
  },
}));

const mockCancelForBlulok = jest.fn().mockResolvedValue(1);
const mockCancelForAccessControl = jest.fn().mockResolvedValue(1);

jest.mock('../../../src/services/device-deletion-outbox.service', () => ({
  DeviceDeletionOutboxService: {
    getInstance: jest.fn(() => ({
      cancelForBlulok: mockCancelForBlulok,
      cancelForAccessControl: mockCancelForAccessControl,
    })),
  },
}));

jest.mock('../../../src/services/database.service', () => ({
  DatabaseService: {
    getInstance: jest.fn(() => ({
      connection: jest.fn((table: string) => ({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(
          table === 'gateways'
            ? { id: 'gateway-123', facility_id: 'facility-1' }
            : null,
        ),
      })),
    })),
  },
}));

// Helper function to create DeviceWithContext objects
const createDeviceWithContext = (overrides: Partial<DeviceWithContext> = {}): DeviceWithContext => ({
  id: 'device-1',
  gateway_id: 'gateway-123',
  facility_id: 'facility-1',
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
    mockCancelForBlulok.mockClear();
    mockCancelForAccessControl.mockClear();
    mockEnsureDefaultGroup.mockClear();
    mockAssignBluLokToDefaultGroup.mockClear();
    mockAssignAccessControlToDefaultGroup.mockClear();
    mockDeleteBluLokFromInventory.mockResolvedValue({
      gatewayId: 'gateway-123',
      facilityId: 'facility-1',
      hadUnit: false,
      unitId: null,
    });

    // Create mock instances
    mockDeviceModel = {
      findBluLokDevices: jest.fn(),
      createBluLokDevice: jest.fn(),
      bulkCreateBluLokDevices: jest.fn().mockResolvedValue(0),
      bulkDeleteBluLokDevices: jest.fn().mockResolvedValue(0),
      updateDeviceStatus: jest.fn(),
      updateLockStatus: jest.fn(),
      updateBatteryLevel: jest.fn(),
      deleteBluLokDevice: jest.fn(),
      updateBluLokDeviceState: jest.fn(),
      updateBluLokDevice: jest.fn(),
      findBluLokDeviceByIdOrSerial: jest.fn(),
      findAccessControlDevices: jest.fn().mockResolvedValue([]),
      bulkCreateAccessControlDevices: jest.fn().mockResolvedValue(0),
      createAccessControlDevice: jest.fn(),
      updateAccessControlDeviceBySerialAndRelay: jest.fn(),
      updateAccessControlDeviceByRelayChannel: jest.fn(),
      updateAccessControlDevice: jest.fn(),
      deleteAccessControlDevice: jest.fn(),
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
      mockDeviceModel.bulkCreateBluLokDevices.mockResolvedValue(1);

      // Execute
      await deviceSyncService.syncGatewayDevices(gatewayId, gatewayDevices);

      // Verify
      expect(mockDeviceModel.findBluLokDevices).toHaveBeenCalledWith({
        gateway_id: gatewayId
      });
      // Now uses bulk create
      expect(mockDeviceModel.bulkCreateBluLokDevices).toHaveBeenCalledWith([{
        gateway_id: gatewayId,
        device_serial: 'ABC123',
        serial: 'ABC123',
        metadata: {
          createdFromGatewaySync: true,
          manuallyAdded: false,
        },
        supports_remote_lock: true,
      }]);
    });

    it('should remove devices no longer on gateway', async () => {
      // Setup
      const existingDevices: DeviceWithContext[] = [
        createDeviceWithContext({
          id: 'device-1',
          device_serial: 'ABC123',
          gateway_id: gatewayId,
          metadata: { createdFromGatewaySync: true },
        })
      ];
      const gatewayDevices: GatewayDeviceData[] = []; // No devices on gateway

      mockDeviceModel.findBluLokDevices.mockResolvedValue(existingDevices);

      await deviceSyncService.syncGatewayDevices(gatewayId, gatewayDevices);

      expect(mockDeleteBluLokFromInventory).toHaveBeenCalledWith('device-1', { source: 'gateway_sync' });
      expect(mockEventService.emitDeviceRemoved).not.toHaveBeenCalled();
    });

    it('should handle mixed add/remove/update scenarios', async () => {
      // Setup
      const existingDevices: DeviceWithContext[] = [
        createDeviceWithContext({
          id: 'device-1',
          device_serial: 'ABC123',
          gateway_id: gatewayId,
          metadata: { createdFromGatewaySync: true },
        }),
        createDeviceWithContext({
          id: 'device-2',
          device_serial: 'DEF456',
          gateway_id: gatewayId,
          metadata: { createdFromGatewaySync: true },
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
      mockDeviceModel.bulkCreateBluLokDevices.mockResolvedValue(1);
      await deviceSyncService.syncGatewayDevices(gatewayId, gatewayDevices);

      expect(mockDeviceModel.bulkCreateBluLokDevices).toHaveBeenCalledTimes(1);
      expect(mockDeleteBluLokFromInventory).toHaveBeenCalledWith('device-2', { source: 'gateway_sync' });
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
      mockDeviceModel.bulkCreateBluLokDevices.mockResolvedValue(3);

      // Execute
      await deviceSyncService.syncGatewayDevices(gatewayId, gatewayDevices);

      // Verify all three devices were created in bulk
      expect(mockDeviceModel.bulkCreateBluLokDevices).toHaveBeenCalledTimes(1);
      expect(mockDeviceModel.bulkCreateBluLokDevices).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ device_serial: 'lock-1' }),
          expect.objectContaining({ device_serial: 'lock-2' }),
          expect.objectContaining({ device_serial: 'ABC123' }),
        ])
      );
    });

    it('should skip devices without valid identifiers', async () => {
      // Setup
      const existingDevices: DeviceWithContext[] = [];
      const gatewayDevices: GatewayDeviceData[] = [
        { online: true, locked: false }, // No identifiers
        { id: 'valid-id', serial: 'ABC123', online: true, locked: false } // Valid
      ];

      mockDeviceModel.findBluLokDevices.mockResolvedValue(existingDevices);
      mockDeviceModel.bulkCreateBluLokDevices.mockResolvedValue(1);

      // Execute
      await deviceSyncService.syncGatewayDevices(gatewayId, gatewayDevices);

      // Verify only the valid device was created (devices without identifiers are filtered out)
      expect(mockDeviceModel.bulkCreateBluLokDevices).toHaveBeenCalledTimes(1);
      expect(mockDeviceModel.bulkCreateBluLokDevices).toHaveBeenCalledWith([
        expect.objectContaining({ device_serial: 'ABC123' })
      ]);
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
      // Bulk create fails, then fall back to individual create
      mockDeviceModel.bulkCreateBluLokDevices.mockRejectedValue(new Error('Bulk insert error'));
      mockDeviceModel.createBluLokDevice.mockRejectedValue(new Error('Database error'));

      // Execute - should not throw
      await expect(deviceSyncService.syncGatewayDevices('gateway-123', gatewayDevices)).resolves.not.toThrow();

      // Verify bulk was attempted first, then fallback to individual
      expect(mockDeviceModel.bulkCreateBluLokDevices).toHaveBeenCalled();
      expect(mockDeviceModel.createBluLokDevice).toHaveBeenCalled();
    });

    it('should handle errors when deleting devices', async () => {
      // Setup
      const existingDevices: DeviceWithContext[] = [
        createDeviceWithContext({
          id: 'device-1',
          device_serial: 'ABC123',
          gateway_id: 'gateway-123',
          metadata: { createdFromGatewaySync: true },
        })
      ];
      const gatewayDevices: GatewayDeviceData[] = [];

      mockDeviceModel.findBluLokDevices.mockResolvedValue(existingDevices);
      // Bulk delete fails, then fall back to individual delete which also fails
      mockDeleteBluLokFromInventory.mockRejectedValue(new Error('Inventory delete error'));

      await expect(deviceSyncService.syncGatewayDevices('gateway-123', gatewayDevices)).resolves.not.toThrow();

      expect(mockDeleteBluLokFromInventory).toHaveBeenCalledWith('device-1', { source: 'gateway_sync' });
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
      // Mock bulk create to return success count
      mockDeviceModel.bulkCreateBluLokDevices.mockResolvedValue(1);

      const result = await deviceSyncService.syncDeviceInventory(gatewayId, [
        { lock_id: 'LOCK-1', lock_number: 101, firmware_version: '1.0.0' },
      ]);

      expect(result.added).toBe(1);
      expect(result.removed).toBe(0);
      expect(result.unchanged).toBe(0);
      expect(result.errors).toHaveLength(0);
      // Now uses bulk create instead of individual create
      expect(mockDeviceModel.bulkCreateBluLokDevices).toHaveBeenCalledWith([{
        gateway_id: gatewayId,
        device_serial: 'LOCK-1',
        serial: 'LOCK-1',
        device_settings: { lockNumber: 101 },
        metadata: { createdFromGatewaySync: true, manuallyAdded: false },
        firmware_version: '1.0.0',
        supports_remote_lock: true,
      }]);
    });

    it('assigns newly synced BluLok locks to the facility default access group', async () => {
      mockDeviceModel.findBluLokDevices
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          createDeviceWithContext({ id: 'device-new', device_serial: 'LOCK-1' }),
        ]);
      mockDeviceModel.bulkCreateBluLokDevices.mockResolvedValue(1);

      await deviceSyncService.syncDeviceInventory(gatewayId, [
        { lock_id: 'LOCK-1', lock_number: 101 },
      ]);

      expect(mockEnsureDefaultGroup).toHaveBeenCalledWith('facility-1');
      expect(mockAssignBluLokToDefaultGroup).toHaveBeenCalledWith('facility-1', 'device-new');
    });

    it('should remove sync-managed devices not in inventory', async () => {
      mockDeviceModel.findBluLokDevices.mockResolvedValue([
        createDeviceWithContext({ id: 'device-1', device_serial: 'LOCK-1' }),
        createDeviceWithContext({
          id: 'device-2',
          device_serial: 'LOCK-2',
          metadata: { createdFromGatewaySync: true },
        }),
      ]);

      const result = await deviceSyncService.syncDeviceInventory(gatewayId, [
        { lock_id: 'LOCK-1' },
      ]);

      expect(result.added).toBe(0);
      expect(result.removed).toBe(1);
      expect(result.unchanged).toBe(1);
      expect(mockDeleteBluLokFromInventory).toHaveBeenCalledWith('device-2', { source: 'gateway_sync' });
    });

    it('should preserve manually provisioned locks not in inventory', async () => {
      mockDeviceModel.findBluLokDevices.mockResolvedValue([
        createDeviceWithContext({ id: 'device-1', device_serial: 'LOCK-1' }),
        createDeviceWithContext({ id: 'device-2', device_serial: 'LOCK-2', metadata: {} }),
      ]);

      const result = await deviceSyncService.syncDeviceInventory(gatewayId, [
        { lock_id: 'LOCK-1' },
      ]);

      expect(result.removed).toBe(0);
      expect(result.skipped_manual).toBe(1);
      expect(mockDeleteBluLokFromInventory).not.toHaveBeenCalled();
    });

    it('should update display name for existing devices from inventory', async () => {
      mockDeviceModel.findBluLokDevices.mockResolvedValue([
        createDeviceWithContext({
          id: 'device-1',
          device_serial: 'LOCK-1',
          device_settings: { displayName: 'Old Name', lockNumber: 101 },
        }),
      ]);
      mockDeviceModel.updateBluLokDevice.mockResolvedValue(
        createDeviceWithContext({
          id: 'device-1',
          device_settings: { displayName: 'New Name', lockNumber: 101 },
        }),
      );

      const result = await deviceSyncService.syncDeviceInventory(gatewayId, [
        { lock_id: 'LOCK-1', name: 'New Name', lock_number: 101 },
      ]);

      expect(result.updated).toBe(1);
      expect(result.unchanged).toBe(0);
      expect(mockDeviceModel.updateBluLokDevice).toHaveBeenCalledWith('device-1', {
        device_settings: { displayName: 'New Name', lockNumber: 101 },
      });
    });

    it('marks manuallyAdded lock as gateway-seen without making it sync-managed', async () => {
      mockDeviceModel.findBluLokDevices.mockResolvedValue([
        createDeviceWithContext({
          id: 'device-1',
          device_serial: 'LOCK-1',
          metadata: { manuallyAdded: true, createdFromGatewaySync: false },
        }),
      ]);
      mockDeviceModel.updateBluLokDevice.mockResolvedValue(
        createDeviceWithContext({ id: 'device-1', device_serial: 'LOCK-1' }),
      );

      const seen = await deviceSyncService.syncDeviceInventory(gatewayId, [
        { lock_id: 'LOCK-1' },
      ]);

      expect(seen.updated).toBe(1);
      expect(mockDeviceModel.updateBluLokDevice).toHaveBeenCalledWith('device-1', {
        metadata: { manuallyAdded: true, createdFromGatewaySync: true },
      });

      mockDeviceModel.findBluLokDevices.mockResolvedValue([
        createDeviceWithContext({
          id: 'device-1',
          device_serial: 'LOCK-1',
          metadata: { manuallyAdded: true, createdFromGatewaySync: true },
        }),
      ]);

      const omitted = await deviceSyncService.syncDeviceInventory(gatewayId, []);
      expect(omitted.removed).toBe(0);
      expect(omitted.skipped_manual).toBe(1);
      expect(mockDeleteBluLokFromInventory).not.toHaveBeenCalled();
    });

    it('should set display name on newly provisioned locks from inventory', async () => {
      mockDeviceModel.findBluLokDevices.mockResolvedValue([]);
      mockDeviceModel.bulkCreateBluLokDevices.mockResolvedValue(1);

      await deviceSyncService.syncDeviceInventory(gatewayId, [
        { lock_id: 'LOCK-NEW', lock_number: 42, name: 'Front Door', location_description: 'Row A' },
      ]);

      expect(mockDeviceModel.bulkCreateBluLokDevices).toHaveBeenCalledWith([
        expect.objectContaining({
          device_serial: 'LOCK-NEW',
          metadata: { createdFromGatewaySync: true, manuallyAdded: false },
          device_settings: {
            lockNumber: 42,
            displayName: 'Front Door',
            locationDescription: 'Row A',
          },
        }),
      ]);
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
      // Now updates via lock_id (device_serial) rather than internal id
      expect(mockDeviceModel.updateBluLokDeviceState).toHaveBeenCalledWith('LOCK-1', {
        firmware_version: '2.0.0',
      });
    });

    it('should update state fields during inventory sync', async () => {
      mockDeviceModel.findBluLokDevices.mockResolvedValue([
        createDeviceWithContext({ id: 'device-1', device_serial: 'LOCK-1' }),
      ]);
      mockDeviceModel.updateBluLokDeviceState.mockResolvedValue(true);

      const result = await deviceSyncService.syncDeviceInventory(gatewayId, [
        {
          lock_id: 'LOCK-1',
          state: 'CLOSED',
          battery_level: 3423,
          online: true,
          signal_strength: -55,
          temperature_value: 24,
        },
      ]);

      expect(result.unchanged).toBe(1);
      expect(mockDeviceModel.updateBluLokDeviceState).toHaveBeenCalledWith('LOCK-1', {
        lock_status: 'locked',
        battery_level: 3423,
        device_status: 'online',
        signal_strength: -55,
        temperature: 24,
      });
    });

    it('should apply state fields when provisioning a new device in one inventory payload', async () => {
      mockDeviceModel.findBluLokDevices.mockResolvedValue([]);
      mockDeviceModel.bulkCreateBluLokDevices.mockResolvedValue(1);
      mockDeviceModel.updateBluLokDeviceState.mockResolvedValue(true);

      const result = await deviceSyncService.syncDeviceInventory(gatewayId, [
        {
          lock_id: 'LOCK-NEW',
          lock_number: 201,
          state: 'OPENED',
          battery_level: 3300,
          online: false,
          signal_strength: -70,
        },
      ]);

      expect(result.added).toBe(1);
      expect(mockDeviceModel.bulkCreateBluLokDevices).toHaveBeenCalled();
      expect(mockDeviceModel.updateBluLokDeviceState).toHaveBeenCalledWith('LOCK-NEW', {
        lock_status: 'unlocked',
        battery_level: 3300,
        device_status: 'offline',
        signal_strength: -70,
      });
    });

    it('should not remove manual devices from empty inventory', async () => {
      mockDeviceModel.findBluLokDevices.mockResolvedValue([
        createDeviceWithContext({
          id: 'device-1',
          device_serial: 'LOCK-1',
          metadata: { createdFromGatewaySync: true },
        }),
      ]);

      const result = await deviceSyncService.syncDeviceInventory(gatewayId, []);

      expect(result.removed).toBe(1);
      expect(mockDeleteBluLokFromInventory).toHaveBeenCalledWith('device-1', { source: 'gateway_sync' });
    });

    it('should remove device that is assigned to a unit', async () => {
      const deviceWithUnit = createDeviceWithContext({
        id: 'device-1',
        device_serial: 'LOCK-1',
        unit_id: 'unit-123',
        metadata: { createdFromGatewaySync: true },
      });

      mockDeviceModel.findBluLokDevices.mockResolvedValue([deviceWithUnit]);

      const result = await deviceSyncService.syncDeviceInventory(gatewayId, []);

      expect(result.removed).toBe(1);
      expect(mockDeleteBluLokFromInventory).toHaveBeenCalledWith('device-1', { source: 'gateway_sync' });
    });

    it('should remove multiple devices including ones with unit assignments', async () => {
      const devices = [
        createDeviceWithContext({ id: 'device-1', device_serial: 'LOCK-1', unit_id: null }),
        createDeviceWithContext({
          id: 'device-2',
          device_serial: 'LOCK-2',
          unit_id: 'unit-123',
          metadata: { createdFromGatewaySync: true },
        }),
        createDeviceWithContext({
          id: 'device-3',
          device_serial: 'LOCK-3',
          unit_id: 'unit-456',
          metadata: { createdFromGatewaySync: true },
        }),
      ];

      mockDeviceModel.findBluLokDevices.mockResolvedValue(devices);

      const result = await deviceSyncService.syncDeviceInventory(gatewayId, [
        { lock_id: 'LOCK-1' },
      ]);

      expect(result.removed).toBe(2);
      expect(result.unchanged).toBe(1);
      expect(mockDeleteBluLokFromInventory).toHaveBeenCalledWith('device-2', { source: 'gateway_sync' });
      expect(mockDeleteBluLokFromInventory).toHaveBeenCalledWith('device-3', { source: 'gateway_sync' });
    });

    it('should cancel pending deletion tombstones for locks present in inventory', async () => {
      mockDeviceModel.findBluLokDevices.mockResolvedValue([
        createDeviceWithContext({ id: 'device-1', device_serial: 'LOCK-1' }),
      ]);

      await deviceSyncService.syncDeviceInventory(gatewayId, [
        { lock_id: 'LOCK-1' },
        { lock_id: 'LOCK-2' },
      ]);

      expect(mockCancelForBlulok).toHaveBeenCalledWith('facility-1', 'LOCK-1');
      expect(mockCancelForBlulok).toHaveBeenCalledWith('facility-1', 'LOCK-2');
    });
  });

  describe('syncAccessDeviceInventory', () => {
    const gatewayId = 'gateway-123';
    const facilityId = 'facility-1';

    beforeEach(() => {
      mockPushCodesToGateway.mockClear();
    });

    it('should add access control devices by access_id and relay_channel', async () => {
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([]);
      mockDeviceModel.bulkCreateAccessControlDevices.mockResolvedValue(1);

      const result = await deviceSyncService.syncAccessDeviceInventory(gatewayId, facilityId, [
        { kind: 'access_control', access_id: 'KP-002', relay_channel: 2, device_type: 'gate' },
      ]);

      expect(result.added).toBe(1);
      expect(mockDeviceModel.bulkCreateAccessControlDevices).toHaveBeenCalledWith([
        expect.objectContaining({
          gateway_id: gatewayId,
          device_serial: 'KP-002',
          relay_channel: 2,
          device_type: 'gate',
          access_methods: ['keypad'],
          metadata: { createdFromGatewaySync: true, manuallyAdded: false },
        }),
      ]);
      expect(mockPushCodesToGateway).toHaveBeenCalledWith(facilityId);
    });

    it('pushes access codes after unchanged inventory sync (reconnect snapshot)', async () => {
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([
        {
          id: 'ac-1',
          gateway_id: gatewayId,
          device_serial: 'KP-001',
          relay_channel: 1,
          metadata: { createdFromGatewaySync: true },
        },
      ] as unknown as AccessControlDevice[]);
      mockDeviceModel.updateAccessControlDeviceBySerialAndRelay.mockResolvedValue({
        id: 'ac-1',
      } as AccessControlDevice);

      const result = await deviceSyncService.syncAccessDeviceInventory(gatewayId, facilityId, [
        { kind: 'access_control', access_id: 'KP-001', relay_channel: 1, online: true },
      ]);

      expect(result.unchanged).toBe(1);
      expect(result.added).toBe(0);
      expect(mockPushCodesToGateway).toHaveBeenCalledWith(facilityId);
    });

    it('should remove sync-managed access devices not in inventory', async () => {
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([
        {
          id: 'ac-1',
          gateway_id: gatewayId,
          device_serial: 'KP-001',
          relay_channel: 1,
          metadata: { createdFromGatewaySync: true },
        },
        {
          id: 'ac-2',
          gateway_id: gatewayId,
          device_serial: 'KP-002',
          relay_channel: 2,
          metadata: {},
        },
      ] as unknown as AccessControlDevice[]);

      const result = await deviceSyncService.syncAccessDeviceInventory(gatewayId, facilityId, [
        { kind: 'access_control', access_id: 'KP-001', relay_channel: 1 },
      ]);

      expect(result.removed).toBe(0);
      expect(result.skipped_manual).toBe(1);
      expect(mockDeleteAccessControlFromInventory).not.toHaveBeenCalled();
    });

    it('should preserve manual access devices and remove sync-managed ones', async () => {
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([
        {
          id: 'ac-1',
          gateway_id: gatewayId,
          device_serial: 'KP-001',
          relay_channel: 1,
          metadata: { createdFromGatewaySync: true },
        },
        {
          id: 'ac-2',
          gateway_id: gatewayId,
          device_serial: 'KP-002',
          relay_channel: 2,
          metadata: {},
        },
      ] as unknown as AccessControlDevice[]);

      const result = await deviceSyncService.syncAccessDeviceInventory(gatewayId, facilityId, []);

      expect(result.removed).toBe(1);
      expect(result.skipped_manual).toBe(1);
      expect(mockDeleteAccessControlFromInventory).toHaveBeenCalledWith('ac-1', { source: 'gateway_sync' });
    });

    it('should remove sync-managed device before adding new serial on the same relay', async () => {
      mockDeviceModel.findAccessControlDevices
        .mockResolvedValueOnce([
          {
            id: 'ac-old',
            gateway_id: gatewayId,
            device_serial: 'OLD-SERIAL',
            relay_channel: 2,
            metadata: { createdFromGatewaySync: true },
          },
        ] as unknown as AccessControlDevice[])
        .mockResolvedValueOnce([] as unknown as AccessControlDevice[]);
      mockDeviceModel.bulkCreateAccessControlDevices.mockResolvedValue(1);

      const result = await deviceSyncService.syncAccessDeviceInventory(gatewayId, facilityId, [
        { kind: 'access_control', access_id: 'NEW-SERIAL', relay_channel: 2 },
      ]);

      expect(mockDeleteAccessControlFromInventory).toHaveBeenCalledWith('ac-old', { source: 'gateway_sync' });
      expect(result.removed).toBe(1);
      expect(result.added).toBe(1);
      expect(mockDeviceModel.bulkCreateAccessControlDevices).toHaveBeenCalledWith([
        expect.objectContaining({ device_serial: 'NEW-SERIAL', relay_channel: 2 }),
      ]);
    });

    it('allows the same access_id on multiple relay channels (multi-door keypad)', async () => {
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([] as unknown as AccessControlDevice[]);
      mockDeviceModel.bulkCreateAccessControlDevices.mockResolvedValue(2);

      const result = await deviceSyncService.syncAccessDeviceInventory(gatewayId, facilityId, [
        { kind: 'access_control', access_id: 'KEYPAD-SHARED', relay_channel: 1, name: 'Main Door' },
        { kind: 'access_control', access_id: 'KEYPAD-SHARED', relay_channel: 2, name: 'Side Door' },
      ]);

      expect(result.added).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(mockDeviceModel.bulkCreateAccessControlDevices).toHaveBeenCalledWith([
        expect.objectContaining({ device_serial: 'KEYPAD-SHARED', relay_channel: 1 }),
        expect.objectContaining({ device_serial: 'KEYPAD-SHARED', relay_channel: 2 }),
      ]);
    });

    it('marks manuallyAdded access device as gateway-seen without making it sync-managed', async () => {
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([
        {
          id: 'ac-manual',
          gateway_id: gatewayId,
          device_serial: 'MANUAL-1',
          name: 'Manual Gate',
          relay_channel: 1,
          metadata: { manuallyAdded: true, createdFromGatewaySync: false },
        },
      ] as unknown as AccessControlDevice[]);
      mockDeviceModel.updateAccessControlDevice.mockResolvedValue({} as AccessControlDevice);

      const seen = await deviceSyncService.syncAccessDeviceInventory(gatewayId, facilityId, [
        { kind: 'access_control', access_id: 'MANUAL-1', relay_channel: 1 },
      ]);

      expect(seen.updated).toBe(1);
      expect(mockDeviceModel.updateAccessControlDevice).toHaveBeenCalledWith('ac-manual', {
        metadata: { manuallyAdded: true, createdFromGatewaySync: true },
      });

      mockDeviceModel.findAccessControlDevices.mockResolvedValue([
        {
          id: 'ac-manual',
          gateway_id: gatewayId,
          device_serial: 'MANUAL-1',
          name: 'Manual Gate',
          relay_channel: 1,
          metadata: { manuallyAdded: true, createdFromGatewaySync: true },
        },
      ] as unknown as AccessControlDevice[]);

      const omitted = await deviceSyncService.syncAccessDeviceInventory(gatewayId, facilityId, []);
      expect(omitted.removed).toBe(0);
      expect(omitted.skipped_manual).toBe(1);
      expect(mockDeleteAccessControlFromInventory).not.toHaveBeenCalled();
    });

    it('allows a new access_id on the same relay_channel as an existing manual device', async () => {
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([
        {
          id: 'ac-manual',
          gateway_id: gatewayId,
          device_serial: 'MANUAL-1',
          relay_channel: 3,
          metadata: { manuallyAdded: true },
        },
      ] as unknown as AccessControlDevice[]);
      mockDeviceModel.bulkCreateAccessControlDevices.mockResolvedValue(1);

      const result = await deviceSyncService.syncAccessDeviceInventory(gatewayId, facilityId, [
        { kind: 'access_control', access_id: 'NEW-SERIAL', relay_channel: 3 },
      ]);

      expect(result.added).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(mockDeviceModel.bulkCreateAccessControlDevices).toHaveBeenCalledWith([
        expect.objectContaining({ device_serial: 'NEW-SERIAL', relay_channel: 3 }),
      ]);
    });

    it('allows two keypads that both default to relay_channel 1', async () => {
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([
        {
          id: 'ac-a',
          gateway_id: gatewayId,
          device_serial: 'KEYPAD-A',
          relay_channel: 1,
          metadata: { createdFromGatewaySync: true },
        },
      ] as unknown as AccessControlDevice[]);
      mockDeviceModel.bulkCreateAccessControlDevices.mockResolvedValue(1);
      mockDeviceModel.updateAccessControlDeviceBySerialAndRelay.mockImplementation(
        async (_gatewayId, accessId) =>
          ({ id: `ac-${accessId}` }) as AccessControlDevice
      );

      const result = await deviceSyncService.syncAccessDeviceInventory(gatewayId, facilityId, [
        { kind: 'access_control', access_id: 'KEYPAD-A', online: true },
        { kind: 'access_control', access_id: 'KEYPAD-B', online: true },
      ]);

      expect(result.added).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(mockDeviceModel.bulkCreateAccessControlDevices).toHaveBeenCalledWith([
        expect.objectContaining({ device_serial: 'KEYPAD-B', relay_channel: 1 }),
      ]);
    });

    it('reconciles admin identity override device serial in place when gateway reports new serial on same relay', async () => {
      mockDeviceModel.findAccessControlDevices
        .mockResolvedValueOnce([
          {
            id: 'ac-override',
            gateway_id: gatewayId,
            device_serial: 'ADMIN-NEW',
            relay_channel: 2,
            name: 'Door 2',
            metadata: { adminIdentityOverride: true },
            device_settings: { device_serial: 'ADMIN-NEW' },
          },
        ] as unknown as AccessControlDevice[])
        .mockResolvedValueOnce([
          {
            id: 'ac-override',
            gateway_id: gatewayId,
            device_serial: 'GATEWAY-SN',
            relay_channel: 2,
            name: 'Door 2',
            metadata: { adminIdentityOverride: true },
            device_settings: { device_serial: 'GATEWAY-SN' },
          },
        ] as unknown as AccessControlDevice[]);
      mockDeviceModel.updateAccessControlDevice.mockResolvedValue({
        id: 'ac-override',
        gateway_id: gatewayId,
        device_serial: 'GATEWAY-SN',
        relay_channel: 2,
        name: 'Door 2',
      } as unknown as AccessControlDevice);

      const result = await deviceSyncService.syncAccessDeviceInventory(gatewayId, facilityId, [
        { kind: 'access_control', access_id: 'GATEWAY-SN', relay_channel: 2 },
      ]);

      expect(mockDeviceModel.updateAccessControlDevice).toHaveBeenCalledWith(
        'ac-override',
        expect.objectContaining({ device_serial: 'GATEWAY-SN' })
      );
      expect(result.added).toBe(0);
      expect(mockDeviceModel.bulkCreateAccessControlDevices).not.toHaveBeenCalled();
    });

    it('does not reconcile admin override when two access_control devices share relay 1 (dual-keypad case)', async () => {
      mockDeviceModel.findAccessControlDevices
        .mockResolvedValueOnce([
          {
            id: 'ac-main-gate',
            gateway_id: gatewayId,
            device_serial: 'f759bd50-a70e-5bba-81c5-25e9a7c695c1',
            relay_channel: 1,
            name: 'Main Gate',
            metadata: { adminIdentityOverride: true },
            device_settings: {},
          },
        ] as unknown as AccessControlDevice[])
        .mockResolvedValueOnce([
          {
            id: 'ac-main-gate',
            gateway_id: gatewayId,
            device_serial: 'f759bd50-a70e-5bba-81c5-25e9a7c695c1',
            relay_channel: 1,
            name: 'Main Gate',
            metadata: { adminIdentityOverride: true },
          },
          {
            id: 'ac-second',
            gateway_id: gatewayId,
            device_serial: '5b679d67-b018-5bea-857a-8c8b1d1e7306',
            relay_channel: 1,
            metadata: { createdFromGatewaySync: true },
          },
        ] as unknown as AccessControlDevice[]);
      mockDeviceModel.updateAccessControlDevice.mockResolvedValue({} as AccessControlDevice);
      mockDeviceModel.bulkCreateAccessControlDevices.mockResolvedValue(1);

      const inventory = [
        {
          kind: 'access_control' as const,
          access_id: 'f759bd50-a70e-5bba-81c5-25e9a7c695c1',
          online: true,
        },
        {
          kind: 'access_control' as const,
          access_id: '5b679d67-b018-5bea-857a-8c8b1d1e7306',
          online: false,
        },
      ];

      const result = await deviceSyncService.syncAccessDeviceInventory(
        gatewayId,
        facilityId,
        inventory,
      );

      expect(mockDeviceModel.updateAccessControlDevice).not.toHaveBeenCalled();
      expect(result.added).toBe(1);
      expect(mockDeviceModel.bulkCreateAccessControlDevices).toHaveBeenCalledWith([
        expect.objectContaining({
          device_serial: '5b679d67-b018-5bea-857a-8c8b1d1e7306',
          relay_channel: 1,
        }),
      ]);
    });

    it('preserves admin override serial across consecutive syncs when two relay-1 keypads are reported', async () => {
      const keypadA = 'f759bd50-a70e-5bba-81c5-25e9a7c695c1';
      const keypadB = '5b679d67-b018-5bea-857a-8c8b1d1e7306';
      const adminPlaceholderSerial = 'ADMIN-MAIN-GATE-PLACEHOLDER';
      const inventory = [
        { kind: 'access_control' as const, access_id: keypadA, online: true },
        { kind: 'access_control' as const, access_id: keypadB, online: false },
      ];

      const overrideRow = {
        id: 'ac-main-gate',
        gateway_id: gatewayId,
        device_serial: adminPlaceholderSerial,
        relay_channel: 1,
        name: 'Main Gate',
        metadata: { adminIdentityOverride: true, manuallyAdded: true },
      };
      const syncedA = {
        id: 'ac-a',
        gateway_id: gatewayId,
        device_serial: keypadA,
        relay_channel: 1,
        metadata: { createdFromGatewaySync: true },
      };
      const syncedB = {
        id: 'ac-b',
        gateway_id: gatewayId,
        device_serial: keypadB,
        relay_channel: 1,
        metadata: { createdFromGatewaySync: true },
      };

      mockDeviceModel.findAccessControlDevices
        .mockResolvedValueOnce([overrideRow] as unknown as AccessControlDevice[])
        .mockResolvedValue([overrideRow, syncedA, syncedB] as unknown as AccessControlDevice[]);
      mockDeviceModel.bulkCreateAccessControlDevices.mockResolvedValue(2);

      const first = await deviceSyncService.syncAccessDeviceInventory(
        gatewayId,
        facilityId,
        inventory,
      );
      expect(first.added).toBe(2);
      expect(mockDeviceModel.updateAccessControlDevice).not.toHaveBeenCalled();

      mockDeviceModel.updateAccessControlDevice.mockClear();

      const second = await deviceSyncService.syncAccessDeviceInventory(
        gatewayId,
        facilityId,
        inventory,
      );
      expect(second.added).toBe(0);
      expect(mockDeviceModel.updateAccessControlDevice).not.toHaveBeenCalled();
    });

    it('auto-provisions both keypads when override placeholder serial matches neither incoming access_id', async () => {
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([
        {
          id: 'ac-main-gate',
          gateway_id: gatewayId,
          device_serial: 'ADMIN-PLACEHOLDER-SN',
          relay_channel: 1,
          name: 'Main Gate',
          metadata: { adminIdentityOverride: true, manuallyAdded: true },
        },
      ] as unknown as AccessControlDevice[]);
      mockDeviceModel.bulkCreateAccessControlDevices.mockResolvedValue(2);

      const result = await deviceSyncService.syncAccessDeviceInventory(gatewayId, facilityId, [
        { kind: 'access_control', access_id: 'KEYPAD-A-UUID', online: true },
        { kind: 'access_control', access_id: 'KEYPAD-B-UUID', online: false },
      ]);

      expect(mockDeviceModel.updateAccessControlDevice).not.toHaveBeenCalled();
      expect(result.added).toBe(2);
      expect(result.skipped_manual).toBe(1);
      expect(mockDeviceModel.bulkCreateAccessControlDevices).toHaveBeenCalledWith([
        expect.objectContaining({ device_serial: 'KEYPAD-A-UUID', relay_channel: 1 }),
        expect.objectContaining({ device_serial: 'KEYPAD-B-UUID', relay_channel: 1 }),
      ]);
    });

    it('does not reconcile when two adminIdentityOverride rows exist on the same relay', async () => {
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([
        {
          id: 'ac-override-1',
          gateway_id: gatewayId,
          device_serial: 'OVERRIDE-1',
          relay_channel: 2,
          metadata: { adminIdentityOverride: true },
        },
        {
          id: 'ac-override-2',
          gateway_id: gatewayId,
          device_serial: 'OVERRIDE-2',
          relay_channel: 2,
          metadata: { adminIdentityOverride: true },
        },
      ] as unknown as AccessControlDevice[]);
      mockDeviceModel.bulkCreateAccessControlDevices.mockResolvedValue(1);

      const result = await deviceSyncService.syncAccessDeviceInventory(gatewayId, facilityId, [
        { kind: 'access_control', access_id: 'GATEWAY-REAL-SN', relay_channel: 2 },
      ]);

      expect(mockDeviceModel.updateAccessControlDevice).not.toHaveBeenCalled();
      expect(result.added).toBe(1);
      expect(mockDeviceModel.bulkCreateAccessControlDevices).toHaveBeenCalledWith([
        expect.objectContaining({ device_serial: 'GATEWAY-REAL-SN', relay_channel: 2 }),
      ]);
    });

    it('should apply online and last_seen during access control inventory sync', async () => {
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([
        {
          id: 'ac-1',
          gateway_id: gatewayId,
          device_serial: 'f759bd50-a70e-5bba-81c5-25e9a7c695c1',
          relay_channel: 1,
          metadata: { createdFromGatewaySync: true },
        },
      ] as unknown as AccessControlDevice[]);
      mockDeviceModel.updateAccessControlDeviceBySerialAndRelay.mockResolvedValue({
        id: 'ac-1',
      } as AccessControlDevice);

      await deviceSyncService.syncAccessDeviceInventory(gatewayId, facilityId, [
        {
          kind: 'access_control',
          access_id: 'f759bd50-a70e-5bba-81c5-25e9a7c695c1',
          online: true,
          last_seen: '2026-06-02T15:18:11.039532Z',
        },
      ]);

      expect(mockDeviceModel.updateAccessControlDeviceBySerialAndRelay).toHaveBeenCalledWith(
        gatewayId,
        'f759bd50-a70e-5bba-81c5-25e9a7c695c1',
        1,
        {
          status: 'online',
          last_activity: expect.any(Date),
        }
      );
    });

    it('should update access_control name and location on existing inventory rows', async () => {
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([
        {
          id: 'ac-1',
          gateway_id: gatewayId,
          device_serial: 'KP-RENAME',
          relay_channel: 2,
          name: 'Old Gate',
          location_description: 'Old location',
          device_type: 'gate',
          metadata: { createdFromGatewaySync: true },
        },
      ] as unknown as AccessControlDevice[]);
      mockDeviceModel.updateAccessControlDevice.mockResolvedValue({
        id: 'ac-1',
        name: 'New Gate',
      } as AccessControlDevice);

      const result = await deviceSyncService.syncAccessDeviceInventory(gatewayId, facilityId, [
        {
          kind: 'access_control',
          access_id: 'KP-RENAME',
          relay_channel: 2,
          name: 'New Gate',
          location_description: 'New location',
          device_type: 'door',
        },
      ]);

      expect(result.updated).toBe(1);
      expect(result.unchanged).toBe(0);
      expect(mockDeviceModel.updateAccessControlDevice).toHaveBeenCalledWith('ac-1', {
        name: 'New Gate',
        location_description: 'New location',
        device_type: 'door',
      });
      expect(mockDeviceModel.updateAccessControlDeviceBySerialAndRelay).not.toHaveBeenCalled();
    });

    it('should cancel pending deletion tombstones for access devices present in inventory', async () => {
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([]);

      await deviceSyncService.syncAccessDeviceInventory(gatewayId, facilityId, [
        { kind: 'access_control', access_id: 'KP-001', relay_channel: 1 },
        { kind: 'access_control', access_id: 'KP-002', relay_channel: 2 },
      ]);

      expect(mockCancelForAccessControl).toHaveBeenCalledWith('facility-1', 'KP-001', 1);
      expect(mockCancelForAccessControl).toHaveBeenCalledWith('facility-1', 'KP-002', 2);
    });
  });

  describe('updateAccessDeviceStates', () => {
    const gatewayId = 'gateway-123';

    it('should update access control state by access_id and relay_channel', async () => {
      mockDeviceModel.updateAccessControlDeviceBySerialAndRelay.mockResolvedValue({
        id: 'ac-1',
      } as AccessControlDevice);

      const result = await deviceSyncService.updateAccessDeviceStates(gatewayId, [
        {
          kind: 'access_control',
          access_id: 'KP-003',
          relay_channel: 3,
          online: true,
          locked: false,
          last_seen: '2026-06-02T15:18:11.039532Z',
        },
      ]);

      expect(result.updated).toBe(1);
      expect(mockDeviceModel.updateAccessControlDeviceBySerialAndRelay).toHaveBeenCalledWith(
        gatewayId,
        'KP-003',
        3,
        {
          status: 'online',
          is_locked: false,
          last_activity: expect.any(Date),
        }
      );
    });

    it('should track not_found for unknown access_id and relay', async () => {
      mockDeviceModel.updateAccessControlDeviceBySerialAndRelay.mockResolvedValue(null);

      const result = await deviceSyncService.updateAccessDeviceStates(gatewayId, [
        { kind: 'access_control', access_id: 'KP-MISSING', relay_channel: 2, online: false },
      ]);

      expect(result.updated).toBe(0);
      expect(result.not_found).toEqual(['KP-MISSING::2']);
    });
  });

  describe('updateDeviceStates', () => {
    const gatewayId = 'gateway-123';

    it('should map state to lock_status', async () => {
      mockDeviceModel.updateBluLokDeviceState.mockResolvedValue(true);

      const result = await deviceSyncService.updateDeviceStates(gatewayId, [
        { lock_id: 'LOCK-1', state: 'CLOSED' },
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
          state: 'OPENED',
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
        { lock_id: 'LOCK-1', state: 'ERROR', error_code: 'E001', error_message: 'Motor stuck' },
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
