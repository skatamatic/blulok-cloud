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
      enrichBluLokList: jest.fn(async (rows: any[]) => Promise.all(rows.map(passthroughEnrich))),
      enrichAccessControlList: jest.fn(async (rows: any[]) => Promise.all(rows.map(passthroughEnrich))),
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
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"device_category":"blulok"')
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
      expect(payload.data.devices[0].device_category).toBe('access_control');
    });

    it('should not send update when subscription filters for a different device', async () => {
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

    it('auto-scopes single-facility users when no facility filter is set', async () => {
      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      const client = {
        userId: 'user-1',
        userRole: UserRole.FACILITY_ADMIN,
        subscriptions: new Map(),
        facilityIds: ['facility-1'],
      };

      mockDeviceModel.findBluLokDevices.mockResolvedValue([mockDevice]);
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([]);

      (manager as any).subscriptionFilters = new Map([['sub-1', {}]]);
      await (manager as any).sendInitialData(mockWs, 'sub-1', client);

      expect(mockDeviceModel.findBluLokDevices).toHaveBeenCalledWith(
        expect.objectContaining({ facility_id: 'facility-1' }),
      );
    });
  });

  describe('handleUnsubscription', () => {
    it('requires subscription ID', () => {
      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      manager.handleUnsubscription(mockWs, { type: 'unsubscription' }, {
        userId: 'user-1',
        userRole: UserRole.ADMIN,
        subscriptions: new Map(),
      });
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('Subscription ID required'));
    });

    it('removes filters and watchers', async () => {
      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      const client = {
        userId: 'user-1',
        userRole: UserRole.ADMIN,
        subscriptions: new Map(),
      };
      mockDeviceModel.findBluLokDevices.mockResolvedValue([]);

      await manager.handleSubscription(
        mockWs,
        { type: 'subscription', subscriptionType: 'device_status', subscriptionId: 'sub-u' },
        client,
      );
      manager.handleUnsubscription(mockWs, { type: 'unsubscription', subscriptionId: 'sub-u' }, client);
      expect((manager as any).subscriptionFilters.has('sub-u')).toBe(false);
    });
  });

  describe('sendInitialData edge cases', () => {
    it('returns empty devices when device_id matches neither table', async () => {
      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      mockDeviceModel.findBluLokDeviceById.mockResolvedValue(null);
      mockDeviceModel.findAccessControlDeviceWithGateway.mockResolvedValue(null);

      (manager as any).subscriptionFilters = new Map([
        ['sub-miss', { deviceId: 'missing' }],
      ]);

      await (manager as any).sendInitialData(mockWs, 'sub-miss', {
        userId: 'user-1',
        userRole: UserRole.ADMIN,
        subscriptions: new Map(),
      });

      const payload = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(payload.data.devices).toEqual([]);
      expect(payload.data.count).toBe(0);
    });

    it('includes access-control devices in unfiltered list', async () => {
      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      mockDeviceModel.findBluLokDevices.mockResolvedValue([]);
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([
        {
          id: 'ac-1',
          name: 'Gate',
          device_serial: 'KP-1',
          facility_id: 'facility-1',
          is_locked: false,
          status: 'online',
          supports_remote_lock: true,
          updated_at: new Date(),
        },
      ]);

      (manager as any).subscriptionFilters = new Map([['sub-ac-list', {}]]);
      await (manager as any).sendInitialData(mockWs, 'sub-ac-list', {
        userId: 'user-1',
        userRole: UserRole.ADMIN,
        subscriptions: new Map(),
      });

      const payload = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(payload.data.devices[0].name).toBe('Gate');
      expect(payload.data.devices[0].lock_status).toBe('unlocked');
      expect(payload.data.devices[0].supports_remote_lock).toBe(true);
    });

    it('prefers display_name when displayName is absent', async () => {
      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      mockDeviceModel.findBluLokDevices.mockResolvedValue([
        {
          ...mockDevice,
          device_settings: { display_name: 'Snake Lock' },
        },
      ]);

      (manager as any).subscriptionFilters = new Map([['sub-name', {}]]);
      await (manager as any).sendInitialData(mockWs, 'sub-name', {
        userId: 'user-1',
        userRole: UserRole.ADMIN,
        subscriptions: new Map(),
      });

      const payload = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(payload.data.devices[0].name).toBe('Snake Lock');
    });
  });

  describe('broadcastDeviceUpdate facility filters', () => {
    it('skips subscriptions filtered to a different facility', async () => {
      const mockWs = { send: jest.fn(), readyState: 1 };
      (manager as any).watchers = new Map([['sub-1', new Set([mockWs])]]);
      (manager as any).clientContext = new Map([
        ['sub-1', { userId: 'u', userRole: UserRole.ADMIN, subscriptions: new Map() }],
      ]);
      (manager as any).subscriptionFilters = new Map([
        ['sub-1', { facilityId: 'facility-2' }],
      ]);
      mockDeviceModel.findBluLokDeviceById.mockResolvedValue(mockDevice);

      await manager.broadcastDeviceUpdate('device-1', 'facility-1');
      expect(mockWs.send).not.toHaveBeenCalled();
    });

    it('skips non-admin clients without facility access', async () => {
      const mockWs = { send: jest.fn(), readyState: 1 };
      (manager as any).watchers = new Map([['sub-1', new Set([mockWs])]]);
      (manager as any).clientContext = new Map([
        [
          'sub-1',
          {
            userId: 'u',
            userRole: UserRole.FACILITY_ADMIN,
            subscriptions: new Map(),
            facilityIds: ['facility-2'],
          },
        ],
      ]);
      (manager as any).subscriptionFilters = new Map([['sub-1', {}]]);
      mockDeviceModel.findBluLokDeviceById.mockResolvedValue(mockDevice);

      await manager.broadcastDeviceUpdate('device-1', 'facility-1');
      expect(mockWs.send).not.toHaveBeenCalled();
    });

    it('returns early when there are no watchers', async () => {
      await expect(manager.broadcastDeviceUpdate('device-1')).resolves.toBeUndefined();
      expect(mockDeviceModel.findBluLokDeviceById).not.toHaveBeenCalled();
    });

    it('handles top-level broadcast errors', async () => {
      (manager as any).watchers = new Map([['sub-1', new Set([{ send: jest.fn(), readyState: 1 }])]]);
      (DeviceReachabilityEnrichmentService.getInstance as jest.Mock).mockReturnValue({
        createLivenessCache: jest.fn().mockRejectedValue(new Error('cache fail')),
        enrichBluLokRow: jest.fn(),
        enrichAccessControlRow: jest.fn(),
        enrichBluLokList: jest.fn(),
        enrichAccessControlList: jest.fn(),
      });
      // Recreate manager to pick up failing enricher
      manager = new DeviceStatusSubscriptionManager();
      (manager as any).watchers = new Map([['sub-1', new Set([{ send: jest.fn(), readyState: 1 }])]]);

      await expect(manager.broadcastDeviceUpdate('device-1')).resolves.toBeUndefined();
    });
  });

  describe('broadcastFacilityReachabilityRefresh', () => {
    it('returns early with no watchers', async () => {
      await manager.broadcastFacilityReachabilityRefresh('facility-1');
      expect(mockDeviceModel.findBluLokDevices).not.toHaveBeenCalled();
    });

    it('broadcasts enriched facility devices with source marker', async () => {
      const mockWs = { send: jest.fn(), readyState: 1 };
      (manager as any).watchers = new Map([['sub-1', new Set([mockWs])]]);
      (manager as any).clientContext = new Map([
        ['sub-1', { userId: 'u', userRole: UserRole.ADMIN, subscriptions: new Map() }],
      ]);
      (manager as any).subscriptionFilters = new Map([['sub-1', { facilityId: 'facility-1' }]]);

      mockDeviceModel.findBluLokDevices.mockResolvedValue([mockDevice]);
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([]);

      await manager.broadcastFacilityReachabilityRefresh('facility-1');

      const payload = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(payload.data.source).toBe('gateway_reachability_refresh');
      expect(payload.data.facilityId).toBe('facility-1');
      expect(payload.data.devices).toHaveLength(1);
    });

    it('skips clients without facility access and mismatched filters', async () => {
      const deniedWs = { send: jest.fn(), readyState: 1 };
      const mismatchWs = { send: jest.fn(), readyState: 1 };
      (manager as any).watchers = new Map([
        ['sub-denied', new Set([deniedWs])],
        ['sub-mismatch', new Set([mismatchWs])],
      ]);
      (manager as any).clientContext = new Map([
        [
          'sub-denied',
          {
            userId: 'u',
            userRole: UserRole.FACILITY_ADMIN,
            subscriptions: new Map(),
            facilityIds: ['facility-2'],
          },
        ],
        [
          'sub-mismatch',
          { userId: 'u', userRole: UserRole.ADMIN, subscriptions: new Map() },
        ],
      ]);
      (manager as any).subscriptionFilters = new Map([
        ['sub-denied', {}],
        ['sub-mismatch', { facilityId: 'facility-2' }],
      ]);

      mockDeviceModel.findBluLokDevices.mockResolvedValue([mockDevice]);
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([]);

      await manager.broadcastFacilityReachabilityRefresh('facility-1');
      expect(deniedWs.send).not.toHaveBeenCalled();
      expect(mismatchWs.send).not.toHaveBeenCalled();
    });

    it('filters to device_id when subscription is device-scoped', async () => {
      const mockWs = { send: jest.fn(), readyState: 1 };
      (manager as any).watchers = new Map([['sub-dev', new Set([mockWs])]]);
      (manager as any).clientContext = new Map([
        ['sub-dev', { userId: 'u', userRole: UserRole.ADMIN, subscriptions: new Map() }],
      ]);
      (manager as any).subscriptionFilters = new Map([
        ['sub-dev', { deviceId: 'device-1' }],
      ]);

      mockDeviceModel.findBluLokDevices.mockResolvedValue([
        mockDevice,
        { ...mockDevice, id: 'device-2' },
      ]);
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([]);

      await manager.broadcastFacilityReachabilityRefresh('facility-1');
      const payload = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(payload.data.devices).toHaveLength(1);
      expect(payload.data.devices[0].id).toBe('device-1');
    });

    it('removes closed sockets and swallows send errors', async () => {
      const closed = { send: jest.fn(), readyState: 3 };
      const bad = {
        send: jest.fn(() => {
          throw new Error('boom');
        }),
        readyState: 1,
      };
      (manager as any).watchers = new Map([['sub-1', new Set([closed, bad])]]);
      (manager as any).clientContext = new Map([
        ['sub-1', { userId: 'u', userRole: UserRole.ADMIN, subscriptions: new Map() }],
      ]);
      (manager as any).subscriptionFilters = new Map([['sub-1', {}]]);
      mockDeviceModel.findBluLokDevices.mockResolvedValue([mockDevice]);
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([]);

      await expect(manager.broadcastFacilityReachabilityRefresh('facility-1')).resolves.toBeUndefined();
      expect(closed.send).not.toHaveBeenCalled();
    });

    it('handles top-level refresh errors', async () => {
      (manager as any).watchers = new Map([['sub-1', new Set([{ send: jest.fn(), readyState: 1 }])]]);
      mockDeviceModel.findBluLokDevices.mockRejectedValue(new Error('db'));
      await expect(manager.broadcastFacilityReachabilityRefresh('facility-1')).resolves.toBeUndefined();
    });
  });

  describe('broadcastUpdate', () => {
    it('returns early with no watchers', async () => {
      await manager.broadcastUpdate();
      expect(mockDeviceModel.findBluLokDevices).not.toHaveBeenCalled();
    });

    it('re-sends initial data to open watchers', async () => {
      const mockWs = { send: jest.fn(), readyState: 1 };
      const closed = { send: jest.fn(), readyState: 3 };
      (manager as any).watchers = new Map([['sub-1', new Set([mockWs, closed])]]);
      (manager as any).clientContext = new Map([
        ['sub-1', { userId: 'u', userRole: UserRole.ADMIN, subscriptions: new Map() }],
      ]);
      (manager as any).subscriptionFilters = new Map([['sub-1', {}]]);
      mockDeviceModel.findBluLokDevices.mockResolvedValue([mockDevice]);
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([]);

      await manager.broadcastUpdate();
      expect(mockWs.send).toHaveBeenCalled();
      expect(closed.send).not.toHaveBeenCalled();
    });

    it('handles top-level broadcastUpdate errors', async () => {
      (manager as any).watchers = {
        keys: () => {
          throw new Error('map broken');
        },
      };
      await expect(manager.broadcastUpdate()).resolves.toBeUndefined();
    });
  });
});

