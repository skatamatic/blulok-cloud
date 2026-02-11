import { ActivitySubscriptionManager } from '@/services/subscriptions/activity-subscription-manager';
import { ActivityLogModel } from '@/models/activity-log.model';
import { ActivityEventsService } from '@/services/events/activity-events.service';
import { UnitModel } from '@/models/unit.model';
import { DeviceModel } from '@/models/device.model';
import { UserRole } from '@/types/auth.types';

// Mock dependencies
jest.mock('@/models/activity-log.model');
jest.mock('@/services/events/activity-events.service');
jest.mock('@/models/unit.model');
jest.mock('@/models/device.model');

// Test UUIDs
const TEST_FACILITY_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const TEST_FACILITY_ID_2 = 'f47ac10b-58cc-4372-a567-0e02b2c3d480';
const TEST_UNIT_ID = 'a47ac10b-58cc-4372-a567-0e02b2c3d479';
const TEST_DEVICE_ID = 'b47ac10b-58cc-4372-a567-0e02b2c3d479';
const TEST_USER_ID = 'c47ac10b-58cc-4372-a567-0e02b2c3d479';
const TEST_ACTIVITY_ID = 'd47ac10b-58cc-4372-a567-0e02b2c3d479';

describe('ActivitySubscriptionManager', () => {
  let manager: ActivitySubscriptionManager;
  let mockActivityLogModel: jest.Mocked<ActivityLogModel>;
  let mockEventService: jest.Mocked<ActivityEventsService>;
  let mockUnitModel: jest.Mocked<UnitModel>;
  let mockDeviceModel: jest.Mocked<DeviceModel>;

  const mockActivityLog = {
    id: TEST_ACTIVITY_ID,
    entity_type: 'device' as const,
    entity_id: TEST_DEVICE_ID,
    activity_type: 'lock' as const,
    title: 'Device Locked',
    description: 'Device was locked',
    actor_type: 'user' as const,
    actor_id: TEST_USER_ID,
    actor_name: 'John Doe',
    result: 'success' as const,
    result_message: null,
    facility_id: TEST_FACILITY_ID,
    unit_id: TEST_UNIT_ID,
    device_id: TEST_DEVICE_ID,
    unit_number: 'A-101',
    device_serial: 'SN-12345',
    facility_name: 'Test Facility',
    occurred_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockClient = {
    userId: TEST_USER_ID,
    userRole: UserRole.FACILITY_ADMIN,
    subscriptions: new Map(),
    facilityIds: [TEST_FACILITY_ID],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockActivityLogModel = {
      findWithContext: jest.fn().mockResolvedValue([mockActivityLog]),
    } as any;

    mockEventService = {
      onActivityLogged: jest.fn().mockReturnValue(() => {}),
    } as any;

    mockUnitModel = {
      findById: jest.fn().mockResolvedValue({ id: TEST_UNIT_ID, facility_id: TEST_FACILITY_ID }),
    } as any;

    mockDeviceModel = {
      findBluLokDeviceById: jest.fn().mockResolvedValue({ id: TEST_DEVICE_ID, facility_id: TEST_FACILITY_ID }),
      findAccessControlDeviceWithGateway: jest.fn().mockResolvedValue({ id: TEST_DEVICE_ID, facility_id: TEST_FACILITY_ID }),
    } as any;

    (ActivityLogModel as jest.MockedClass<typeof ActivityLogModel>).mockImplementation(() => mockActivityLogModel);
    (ActivityEventsService.getInstance as jest.Mock).mockReturnValue(mockEventService);
    (UnitModel as jest.MockedClass<typeof UnitModel>).mockImplementation(() => mockUnitModel);
    (DeviceModel as jest.MockedClass<typeof DeviceModel>).mockImplementation(() => mockDeviceModel);

    manager = new ActivitySubscriptionManager();
  });

  describe('getSubscriptionType', () => {
    it('should return activity', () => {
      expect(manager.getSubscriptionType()).toBe('activity');
    });
  });

  describe('canSubscribe', () => {
    it('should allow all user roles to subscribe', () => {
      expect(manager.canSubscribe(UserRole.ADMIN)).toBe(true);
      expect(manager.canSubscribe(UserRole.DEV_ADMIN)).toBe(true);
      expect(manager.canSubscribe(UserRole.FACILITY_ADMIN)).toBe(true);
      expect(manager.canSubscribe(UserRole.TENANT)).toBe(true);
      expect(manager.canSubscribe(UserRole.MAINTENANCE)).toBe(true);
    });
  });

  describe('handleSubscription', () => {
    it('should subscribe without filters and send activity', async () => {
      const mockWs = {
        send: jest.fn(),
        readyState: 1, // OPEN
      } as any;

      const result = await manager.handleSubscription(
        mockWs,
        { type: 'subscription', subscriptionType: 'activity' },
        mockClient
      );

      expect(result).toBe(true);
      expect(mockActivityLogModel.findWithContext).toHaveBeenCalled();
      expect(mockWs.send).toHaveBeenCalled();

      // Verify the message format
      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage.type).toBe('activity_update');
      expect(sentMessage.data.activities).toHaveLength(1);
      expect(sentMessage.data.activities[0].activityType).toBe('lock');
    });

    it('should subscribe with facility filter', async () => {
      const mockWs = {
        send: jest.fn(),
        readyState: 1, // OPEN
      } as any;

      const result = await manager.handleSubscription(
        mockWs,
        {
          type: 'subscription',
          subscriptionType: 'activity',
          data: { facilityId: TEST_FACILITY_ID },
        },
        mockClient
      );

      expect(result).toBe(true);
      expect(mockActivityLogModel.findWithContext).toHaveBeenCalledWith(
        expect.objectContaining({
          facility_id: TEST_FACILITY_ID,
        })
      );
    });

    it('should reject subscription for unauthorized facility', async () => {
      const mockWs = {
        send: jest.fn(),
        readyState: 1, // OPEN
      } as any;

      const tenantClient = {
        ...mockClient,
        facilityIds: [TEST_FACILITY_ID_2],
      };

      const result = await manager.handleSubscription(
        mockWs,
        {
          type: 'subscription',
          subscriptionType: 'activity',
          data: { facilityId: TEST_FACILITY_ID },
        },
        tenantClient
      );

      expect(result).toBe(false);
      expect(mockWs.send).toHaveBeenCalled();

      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage.type).toBe('error');
    });

    it('should subscribe with unit filter', async () => {
      const mockWs = {
        send: jest.fn(),
        readyState: 1, // OPEN
      } as any;

      await manager.handleSubscription(
        mockWs,
        {
          type: 'subscription',
          subscriptionType: 'activity',
          data: { unitId: TEST_UNIT_ID },
        },
        mockClient
      );

      expect(mockActivityLogModel.findWithContext).toHaveBeenCalledWith(
        expect.objectContaining({
          unit_id: TEST_UNIT_ID,
        })
      );
    });

    it('should subscribe with device filter', async () => {
      const mockWs = {
        send: jest.fn(),
        readyState: 1, // OPEN
      } as any;

      await manager.handleSubscription(
        mockWs,
        {
          type: 'subscription',
          subscriptionType: 'activity',
          data: { deviceId: TEST_DEVICE_ID },
        },
        mockClient
      );

      expect(mockActivityLogModel.findWithContext).toHaveBeenCalledWith(
        expect.objectContaining({
          device_id: TEST_DEVICE_ID,
        })
      );
    });
  });

  describe('event listeners', () => {
    it('should setup event listeners on construction', () => {
      expect(mockEventService.onActivityLogged).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should clean up watchers on disconnect', async () => {
      const mockWs = {
        send: jest.fn(),
        readyState: 1, // OPEN
      } as any;

      await manager.handleSubscription(
        mockWs,
        { type: 'subscription', subscriptionType: 'activity', subscriptionId: 'sub-1' },
        mockClient
      );

      manager.cleanup(mockWs, mockClient);

      // The subscription should be cleaned up
      // We can't directly test internal state, but cleanup should not throw
    });
  });
});
