import { DeviceStatusSubscriptionManager } from '@/services/subscriptions/device-status-subscription-manager';
import { DeviceModel } from '@/models/device.model';
import { UserRole } from '@/types/auth.types';
import { DeviceReachabilityEnrichmentService } from '@/services/device-reachability-enrichment.service';

// Mock the DeviceModel
jest.mock('@/models/device.model');

const passthroughEnrich = async <T extends Record<string, unknown>>(row: T): Promise<T> => ({
  ...row,
  reported_device_status: row.device_status ?? row.status,
  reported_status: row.status,
  status_unreachable_reason: null,
});

jest.mock('@/services/device-reachability-enrichment.service', () => ({
  DeviceReachabilityEnrichmentService: {
    getInstance: jest.fn(),
  },
}));

describe('DeviceStatusSubscriptionManager', () => {
  let manager: DeviceStatusSubscriptionManager;
  let mockDeviceModel: jest.Mocked<DeviceModel>;

  const mockDevice: any = {
    id: 'device-1',
    device_serial: 'SN-12345',
    device_settings: { displayName: 'Front Lock', lockNumber: 12 },
    unit_id: 'unit-1',
    unit_number: 'A-101',
    facility_id: 'facility-1',
    facility_name: 'Test Facility',
    gateway_id: 'gateway-1',
    gateway_name: 'Test Gateway',
    lock_status: 'locked' as const,
    device_status: 'online' as const,
    battery_level: 85,
    signal_strength: -55,
    temperature: 22.5,
    error_code: null,
    error_message: null,
    firmware_version: '1.0.0',
    last_activity: new Date(),
    last_seen: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockDevices: any[] = [
    mockDevice,
    {
      ...mockDevice,
      id: 'device-2',
      device_serial: 'SN-12346',
      unit_number: 'A-102',
      battery_level: 15,
      signal_strength: -75,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockDeviceModel = {
      findBluLokDeviceById: jest.fn(),
      findBluLokDevices: jest.fn().mockResolvedValue([]),
      findAccessControlDevices: jest.fn().mockResolvedValue([]),
      findAccessControlDeviceWithGateway: jest.fn(),
    } as any;
    
    // Mock the DeviceModel constructor
    (DeviceModel as jest.MockedClass<typeof DeviceModel>).mockImplementation(() => mockDeviceModel);

    (DeviceReachabilityEnrichmentService.getInstance as jest.Mock).mockReturnValue({
      createLivenessCache: jest.fn().mockResolvedValue(new Map()),
      enrichBluLokRow: jest.fn(passthroughEnrich),
      enrichAccessControlRow: jest.fn(passthroughEnrich),
    });
    
    manager = new DeviceStatusSubscriptionManager();
  });

  describe('getSubscriptionType', () => {
    it('should return device_status', () => {
      expect(manager.getSubscriptionType()).toBe('device_status');
    });
  });

  describe('canSubscribe', () => {
    it('should allow all user roles to subscribe', () => {
      expect(manager.canSubscribe(UserRole.ADMIN)).toBe(true);
      expect(manager.canSubscribe(UserRole.DEV_ADMIN)).toBe(true);
      expect(manager.canSubscribe(UserRole.FACILITY_ADMIN)).toBe(true);
      expect(manager.canSubscribe(UserRole.TENANT)).toBe(true);
      expect(manager.canSubscribe(UserRole.MAINTENANCE)).toBe(true);
      expect(manager.canSubscribe(UserRole.BLULOK_TECHNICIAN)).toBe(true);
    });
  });

  describe('handleSubscription', () => {
    const mockClient = {
      userId: 'user-1',
      userRole: UserRole.ADMIN,
      subscriptions: new Map(),
      facilityIds: ['facility-1'],
    };

    it('should subscribe without filters and send all devices', async () => {
      const mockWs = {
        send: jest.fn(),
        readyState: 1, // OPEN
      } as any;

      mockDeviceModel.findBluLokDevices.mockResolvedValue(mockDevices);

      const result = await manager.handleSubscription(
        mockWs,
        { type: 'subscription', subscriptionType: 'device_status' },
        mockClient
      );

      expect(result).toBe(true);
      expect(mockDeviceModel.findBluLokDevices).toHaveBeenCalled();
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"device_status_update"')
      );
    });

    it('should subscribe with device_id filter and send single device', async () => {
      const mockWs = {
        send: jest.fn(),
        readyState: 1, // OPEN
      } as any;

      mockDeviceModel.findBluLokDeviceById.mockResolvedValue(mockDevice);

      const result = await manager.handleSubscription(
        mockWs,
        { 
          type: 'subscription', 
          subscriptionType: 'device_status',
          data: { device_id: 'device-1' }
        },
        mockClient
      );

      expect(result).toBe(true);
      expect(mockDeviceModel.findBluLokDeviceById).toHaveBeenCalledWith('device-1');
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"device_serial":"SN-12345"')
      );
    });

    it('should subscribe with access_control device_id and send formatted row', async () => {
      const mockWs = {
        send: jest.fn(),
        readyState: 1,
      } as any;

      mockDeviceModel.findBluLokDeviceById.mockResolvedValue(null);
      mockDeviceModel.findAccessControlDeviceWithGateway.mockResolvedValue({
        id: 'ac-1',
        device_serial: 'KP-001',
        name: 'Main Gate',
        device_type: 'door',
        relay_channel: 1,
        location_description: 'North lot',
        facility_id: 'facility-1',
        gateway_id: 'gateway-1',
        gateway_name: 'Test Gateway',
        is_locked: false,
        status: 'online',
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await manager.handleSubscription(
        mockWs,
        {
          type: 'subscription',
          subscriptionType: 'device_status',
          data: { device_id: 'ac-1' },
        },
        mockClient
      );

      expect(result).toBe(true);
      expect(mockDeviceModel.findAccessControlDeviceWithGateway).toHaveBeenCalledWith('ac-1');
      const payload = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(payload.data.devices[0].name).toBe('Main Gate');
    });

    it('should subscribe with facility_id filter', async () => {
      const mockWs = {
        send: jest.fn(),
        readyState: 1, // OPEN
      } as any;

      mockDeviceModel.findBluLokDevices.mockResolvedValue(mockDevices);

      const result = await manager.handleSubscription(
        mockWs,
        { 
          type: 'subscription', 
          subscriptionType: 'device_status',
          data: { facility_id: 'facility-1' }
        },
        mockClient
      );

      expect(result).toBe(true);
      expect(mockDeviceModel.findBluLokDevices).toHaveBeenCalled();
    });

    it('should deny subscription for non-authorized roles', async () => {
      // Override canSubscribe temporarily
      const originalCanSubscribe = manager.canSubscribe.bind(manager);
      manager.canSubscribe = jest.fn().mockReturnValue(false);

      const mockWs = {
        send: jest.fn(),
        readyState: 1, // OPEN
      } as any;

      const result = await manager.handleSubscription(
        mockWs,
        { type: 'subscription', subscriptionType: 'device_status' },
        mockClient
      );

      expect(result).toBe(false);
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('Access denied')
      );

      // Restore
      manager.canSubscribe = originalCanSubscribe;
    });
  });

  describe('sendInitialData', () => {
    const mockClient = {
      userId: 'user-1',
      userRole: UserRole.ADMIN,
      subscriptions: new Map(),
    };

    it('should send initial device data', async () => {
      const mockWs = {
        send: jest.fn(),
        readyState: 1, // OPEN
      } as any;

      mockDeviceModel.findBluLokDevices.mockResolvedValue(mockDevices);

      // Need to set up subscription filters first
      (manager as any).subscriptionFilters = new Map([
        ['test-subscription', {}],
      ]);

      await (manager as any).sendInitialData(mockWs, 'test-subscription', mockClient);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"device_status_update"')
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"count":2')
      );
    });

    it('should include telemetry fields in device data', async () => {
      const mockWs = {
        send: jest.fn(),
        readyState: 1, // OPEN
      } as any;

      mockDeviceModel.findBluLokDevices.mockResolvedValue([mockDevice]);

      (manager as any).subscriptionFilters = new Map([
        ['test-subscription', {}],
      ]);

      await (manager as any).sendInitialData(mockWs, 'test-subscription', mockClient);

      const sentData = mockWs.send.mock.calls[0][0];
      const parsed = JSON.parse(sentData);
      const device = parsed.data.devices[0];

      expect(device.signal_strength).toBe(-55);
      expect(device.temperature).toBe(22.5);
      expect(device.battery_level).toBe(85);
      expect(device.error_code).toBeNull();
    });

    it('should include display name metadata in device data', async () => {
      const mockWs = {
        send: jest.fn(),
        readyState: 1,
      } as any;

      mockDeviceModel.findBluLokDevices.mockResolvedValue([mockDevice]);

      (manager as any).subscriptionFilters = new Map([
        ['test-subscription', {}],
      ]);

      await (manager as any).sendInitialData(mockWs, 'test-subscription', mockClient);

      const sentData = mockWs.send.mock.calls[0][0];
      const parsed = JSON.parse(sentData);
      const device = parsed.data.devices[0];

      expect(device.name).toBe('Front Lock');
      expect(device.device_settings).toEqual({ displayName: 'Front Lock', lockNumber: 12 });
    });

    it('includes reachability fields in enriched device data', async () => {
      const mockWs = {
        send: jest.fn(),
        readyState: 1,
      } as any;

      const enricher = DeviceReachabilityEnrichmentService.getInstance() as jest.Mocked<any>;
      enricher.enrichBluLokRow.mockResolvedValue({
        ...mockDevice,
        device_status: 'offline',
        reported_device_status: 'online',
        status_unreachable_reason: 'gateway_offline',
      });

      mockDeviceModel.findBluLokDevices.mockResolvedValue([mockDevice]);

      (manager as any).subscriptionFilters = new Map([
        ['test-subscription', {}],
      ]);

      await (manager as any).sendInitialData(mockWs, 'test-subscription', mockClient);

      const parsed = JSON.parse(mockWs.send.mock.calls[0][0]);
      const device = parsed.data.devices[0];

      expect(device.device_status).toBe('offline');
      expect(device.reported_device_status).toBe('online');
      expect(device.status_unreachable_reason).toBe('gateway_offline');
    });

    it('should handle errors gracefully', async () => {
      const mockWs = {
        send: jest.fn(),
        readyState: 1, // OPEN
      } as any;

      mockDeviceModel.findBluLokDevices.mockRejectedValue(new Error('Database error'));
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([]);

      (manager as any).subscriptionFilters = new Map([
        ['test-subscription', {}],
      ]);

      await (manager as any).sendInitialData(mockWs, 'test-subscription', mockClient);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"error"')
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load initial device status data')
      );
    });

    it('should filter by device_id when specified', async () => {
      const mockWs = {
        send: jest.fn(),
        readyState: 1, // OPEN
      } as any;

      mockDeviceModel.findBluLokDeviceById.mockResolvedValue(mockDevice);

      (manager as any).subscriptionFilters = new Map([
        ['test-subscription', { deviceId: 'device-1' }],
      ]);

      await (manager as any).sendInitialData(mockWs, 'test-subscription', mockClient);

      expect(mockDeviceModel.findBluLokDeviceById).toHaveBeenCalledWith('device-1');
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"count":1')
      );
    });
  });

  describe('broadcastDeviceUpdate', () => {
    const mockClient = {
      userId: 'user-1',
      userRole: UserRole.ADMIN,
      subscriptions: new Map(),
    };

    it('should broadcast update to subscribed clients', async () => {
      const mockWs = { send: jest.fn(), readyState: 1 };
      
      (manager as any).watchers = new Map([
        ['sub-1', new Set([mockWs])],
      ]);
      (manager as any).clientContext = new Map([
        ['sub-1', mockClient],
      ]);
      (manager as any).subscriptionFilters = new Map([
        ['sub-1', { deviceId: 'device-1' }],
      ]);

      mockDeviceModel.findBluLokDeviceById.mockResolvedValue(mockDevice);

      await manager.broadcastDeviceUpdate('device-1');

      expect(mockDeviceModel.findBluLokDeviceById).toHaveBeenCalledWith('device-1');
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"device_status_update"')
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"updatedDeviceId":"device-1"')
      );
    });

    it('should broadcast access_control metadata including name', async () => {
      const mockWs = { send: jest.fn(), readyState: 1 };

      (manager as any).watchers = new Map([
        ['sub-1', new Set([mockWs])],
      ]);
      (manager as any).clientContext = new Map([
        ['sub-1', mockClient],
      ]);
      (manager as any).subscriptionFilters = new Map([
        ['sub-1', { deviceId: 'ac-1' }],
      ]);

      mockDeviceModel.findBluLokDeviceById.mockResolvedValue(null);
      mockDeviceModel.findAccessControlDeviceWithGateway.mockResolvedValue({
        id: 'ac-1',
        device_serial: 'KP-001',
        name: 'Main Gate',
        device_type: 'door',
        relay_channel: 1,
        location_description: 'North lot',
        facility_id: 'facility-1',
        gateway_id: 'gateway-1',
        gateway_name: 'Test Gateway',
        is_locked: false,
        status: 'online',
        created_at: new Date(),
        updated_at: new Date(),
      });

      await manager.broadcastDeviceUpdate('ac-1', 'facility-1');

      const payload = JSON.parse(mockWs.send.mock.calls[0][0]);
      const device = payload.data.devices[0];
      expect(device.name).toBe('Main Gate');
      expect(device.location_description).toBe('North lot');
      expect(device.device_serial).toBe('KP-001');
    });

    it('maps MySQL tinyint is_locked=1 to lock_status locked', async () => {
      const mockWs = { send: jest.fn(), readyState: 1 };

      (manager as any).watchers = new Map([
        ['sub-1', new Set([mockWs])],
      ]);
      (manager as any).clientContext = new Map([
        ['sub-1', { userRole: 'admin', facilityIds: ['facility-1'] }],
      ]);
      (manager as any).subscriptionFilters = new Map([
        ['sub-1', { deviceId: 'ac-1' }],
      ]);

      mockDeviceModel.findBluLokDeviceById.mockResolvedValue(null);
      mockDeviceModel.findAccessControlDeviceWithGateway.mockResolvedValue({
        id: 'ac-1',
        device_serial: 'KP-001',
        name: 'Main Gate',
        facility_id: 'facility-1',
        gateway_id: 'gateway-1',
        is_locked: 1,
        status: 'online',
        created_at: new Date(),
        updated_at: new Date(),
      });

      await manager.broadcastDeviceUpdate('ac-1', 'facility-1');

      const payload = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(payload.data.devices[0].lock_status).toBe('locked');
    });
      const mockWs = { send: jest.fn(), readyState: 1 };
      
      (manager as any).watchers = new Map([
        ['sub-1', new Set([mockWs])],
      ]);
      (manager as any).clientContext = new Map([
        ['sub-1', mockClient],
      ]);
      (manager as any).subscriptionFilters = new Map([
        ['sub-1', { deviceId: 'device-2' }], // Different device
      ]);

      mockDeviceModel.findBluLokDeviceById.mockResolvedValue(mockDevice);

      await manager.broadcastDeviceUpdate('device-1');

      // Should not send because the subscription is for a different device
      expect(mockWs.send).not.toHaveBeenCalled();
    });

    it('should broadcast to subscriptions without device filter', async () => {
      const mockWs = { send: jest.fn(), readyState: 1 };
      
      (manager as any).watchers = new Map([
        ['sub-1', new Set([mockWs])],
      ]);
      (manager as any).clientContext = new Map([
        ['sub-1', mockClient],
      ]);
      (manager as any).subscriptionFilters = new Map([
        ['sub-1', {}], // No filter - should receive all updates
      ]);

      mockDeviceModel.findBluLokDeviceById.mockResolvedValue(mockDevice);

      await manager.broadcastDeviceUpdate('device-1');

      expect(mockWs.send).toHaveBeenCalled();
    });

    it('should handle missing device gracefully', async () => {
      const mockWs = { send: jest.fn(), readyState: 1 };
      
      (manager as any).watchers = new Map([
        ['sub-1', new Set([mockWs])],
      ]);
      (manager as any).clientContext = new Map([
        ['sub-1', mockClient],
      ]);
      (manager as any).subscriptionFilters = new Map([
        ['sub-1', { deviceId: 'device-1' }],
      ]);

      mockDeviceModel.findBluLokDeviceById.mockResolvedValue(null);

      await expect(manager.broadcastDeviceUpdate('device-1')).resolves.not.toThrow();
      expect(mockWs.send).not.toHaveBeenCalled();
    });

    it('should handle closed WebSocket connections', async () => {
      const closedWs = { send: jest.fn(), readyState: 3 }; // CLOSED
      
      (manager as any).watchers = new Map([
        ['sub-1', new Set([closedWs])],
      ]);
      (manager as any).clientContext = new Map([
        ['sub-1', mockClient],
      ]);
      (manager as any).subscriptionFilters = new Map([
        ['sub-1', {}],
      ]);

      mockDeviceModel.findBluLokDeviceById.mockResolvedValue(mockDevice);

      await manager.broadcastDeviceUpdate('device-1');

      expect(closedWs.send).not.toHaveBeenCalled();
    });

    it('should handle WebSocket send errors', async () => {
      const errorWs = { 
        send: jest.fn().mockImplementation(() => { throw new Error('Send failed'); }), 
        readyState: 1 
      };
      
      (manager as any).watchers = new Map([
        ['sub-1', new Set([errorWs])],
      ]);
      (manager as any).clientContext = new Map([
        ['sub-1', mockClient],
      ]);
      (manager as any).subscriptionFilters = new Map([
        ['sub-1', {}],
      ]);

      mockDeviceModel.findBluLokDeviceById.mockResolvedValue(mockDevice);

      await expect(manager.broadcastDeviceUpdate('device-1')).resolves.not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should clean up subscription filters on client disconnect', () => {
      const mockWs = { send: jest.fn(), readyState: 1 };
      const mockClient = {
        userId: 'user-1',
        userRole: UserRole.ADMIN,
        subscriptions: new Map(),
      };
      
      (manager as any).watchers = new Map([
        ['sub-1', new Set([mockWs])],
      ]);
      (manager as any).clientContext = new Map([
        ['sub-1', mockClient],
      ]);
      (manager as any).subscriptionFilters = new Map([
        ['sub-1', { deviceId: 'device-1' }],
      ]);

      manager.cleanup(mockWs as any, mockClient);

      expect((manager as any).watchers.has('sub-1')).toBe(false);
      expect((manager as any).clientContext.has('sub-1')).toBe(false);
      expect((manager as any).subscriptionFilters.has('sub-1')).toBe(false);
    });
  });

  describe('facility access control', () => {
    it('should deny access to facilities user does not have access to', async () => {
      const mockWs = {
        send: jest.fn(),
        readyState: 1,
      } as any;

      const facilityAdminClient = {
        userId: 'user-1',
        userRole: UserRole.FACILITY_ADMIN,
        subscriptions: new Map(),
        facilityIds: ['facility-2'], // Different facility
      };

      (manager as any).subscriptionFilters = new Map([
        ['test-subscription', { facilityId: 'facility-1' }],
      ]);

      await (manager as any).sendInitialData(mockWs, 'test-subscription', facilityAdminClient);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('Access denied')
      );
    });

    it('should allow admins to access any facility', async () => {
      const mockWs = {
        send: jest.fn(),
        readyState: 1,
      } as any;

      const adminClient = {
        userId: 'user-1',
        userRole: UserRole.ADMIN,
        subscriptions: new Map(),
        facilityIds: [], // No explicit facility access
      };

      mockDeviceModel.findBluLokDevices.mockResolvedValue(mockDevices);

      (manager as any).subscriptionFilters = new Map([
        ['test-subscription', { facilityId: 'any-facility' }],
      ]);

      await (manager as any).sendInitialData(mockWs, 'test-subscription', adminClient);

      // Should succeed because admin has access to all facilities
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"device_status_update"')
      );
    });
  });
});

