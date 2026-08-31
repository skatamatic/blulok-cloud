import { ActivityService } from '@/services/activity.service';
import { ActivityLogModel } from '@/models/activity-log.model';
import { ActivityEventsService } from '@/services/events/activity-events.service';
import { UnitModel } from '@/models/unit.model';
import { DeviceModel } from '@/models/device.model';
import { UnitAssignmentModel } from '@/models/unit-assignment.model';
import { UserRole } from '@/types/auth.types';

// Mock dependencies
jest.mock('@/models/activity-log.model');
jest.mock('@/services/events/activity-events.service');
jest.mock('@/models/unit.model');
jest.mock('@/models/device.model');
jest.mock('@/models/unit-assignment.model');

describe('ActivityService', () => {
  let service: ActivityService;
  let mockActivityLogModel: jest.Mocked<ActivityLogModel>;
  let mockEventService: jest.Mocked<ActivityEventsService>;
  let mockUnitModel: jest.Mocked<UnitModel>;
  let mockDeviceModel: jest.Mocked<DeviceModel>;
  let mockUnitAssignmentModel: jest.Mocked<UnitAssignmentModel>;

  const mockActivityLog = {
    id: 'activity-1',
    entity_type: 'device' as const,
    entity_id: 'device-1',
    activity_type: 'lock' as const,
    title: 'Device Locked',
    description: 'Device was locked by user',
    actor_type: 'user' as const,
    actor_id: 'user-1',
    actor_name: 'John Doe',
    result: 'success' as const,
    result_message: null,
    facility_id: 'facility-1',
    unit_id: 'unit-1',
    device_id: 'device-1',
    metadata: null,
    ip_address: '192.168.1.1',
    occurred_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockActivityLogWithContext = {
    ...mockActivityLog,
    unit_number: 'A-101',
    device_serial: 'SN-12345',
    facility_name: 'Test Facility',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockActivityLogModel = {
      create: jest.fn().mockResolvedValue(mockActivityLog),
      findById: jest.fn().mockResolvedValue(mockActivityLog),
      find: jest.fn().mockResolvedValue([mockActivityLog]),
      findWithContext: jest.fn().mockResolvedValue([mockActivityLogWithContext]),
      count: jest.fn().mockResolvedValue(1),
    } as any;

    mockEventService = {
      emitActivityLogged: jest.fn(),
    } as any;

    mockUnitModel = {
      findById: jest.fn().mockResolvedValue({ id: 'unit-1', facility_id: 'facility-1' }),
    } as any;

    mockDeviceModel = {
      findBluLokDeviceById: jest.fn().mockResolvedValue({ id: 'device-1', facility_id: 'facility-1' }),
      findAccessControlDeviceWithGateway: jest.fn().mockResolvedValue({ id: 'device-1', facility_id: 'facility-1' }),
    } as any;

    mockUnitAssignmentModel = {
      findByUnitAndTenant: jest.fn().mockResolvedValue({ id: 'assignment-1', unit_id: 'unit-1', tenant_id: 'user-1' }),
    } as any;

    (ActivityLogModel as jest.MockedClass<typeof ActivityLogModel>).mockImplementation(() => mockActivityLogModel);
    (ActivityEventsService.getInstance as jest.Mock).mockReturnValue(mockEventService);
    (UnitModel as jest.MockedClass<typeof UnitModel>).mockImplementation(() => mockUnitModel);
    (DeviceModel as jest.MockedClass<typeof DeviceModel>).mockImplementation(() => mockDeviceModel);
    (UnitAssignmentModel as jest.MockedClass<typeof UnitAssignmentModel>).mockImplementation(() => mockUnitAssignmentModel);

    // Reset the singleton
    (ActivityService as any).instance = undefined;
    service = ActivityService.getInstance();
  });

  describe('logActivity', () => {
    it('should log activity and emit event', async () => {
      const result = await service.logActivity({
        entityType: 'device',
        entityId: 'device-1',
        activityType: 'lock',
        title: 'Device Locked',
        actorType: 'user',
        actorId: 'user-1',
        actorName: 'John Doe',
        facilityId: 'facility-1',
      });

      expect(result).toBeDefined();
      expect(result.activityType).toBe('lock');
      expect(result.title).toBe('Device Locked');
      expect(result.actor.type).toBe('user');
      expect(result.actor.id).toBe('user-1');
      expect(result.actor.name).toBe('John Doe');
      expect(mockActivityLogModel.create).toHaveBeenCalled();
      expect(mockEventService.emitActivityLogged).toHaveBeenCalled();
    });

    it('should log activity with all options', async () => {
      await service.logActivity({
        entityType: 'unit',
        entityId: 'unit-1',
        activityType: 'assignment_change',
        title: 'User Assigned',
        description: 'User was assigned to the unit',
        actorType: 'user',
        actorId: 'admin-1',
        actorName: 'Admin User',
        result: 'success',
        facilityId: 'facility-1',
        unitId: 'unit-1',
        metadata: { userId: 'user-1' },
        ipAddress: '192.168.1.1',
      });

      expect(mockActivityLogModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'unit',
          entity_id: 'unit-1',
          activity_type: 'assignment_change',
          description: 'User was assigned to the unit',
          actor_type: 'user',
          actor_id: 'admin-1',
          actor_name: 'Admin User',
          result: 'success',
          facility_id: 'facility-1',
          unit_id: 'unit-1',
          metadata: { userId: 'user-1' },
          ip_address: '192.168.1.1',
        })
      );
    });

    it('should default result to success when not provided', async () => {
      await service.logActivity({
        entityType: 'device',
        entityId: 'device-1',
        activityType: 'lock',
        title: 'Test',
        actorType: 'system',
      });

      expect(mockActivityLogModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          result: 'success',
        })
      );
    });

    it('should use current time for occurred_at when not provided', async () => {
      await service.logActivity({
        entityType: 'device',
        entityId: 'device-1',
        activityType: 'lock',
        title: 'Test',
        actorType: 'system',
      });

      expect(mockActivityLogModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          occurred_at: expect.any(Date),
        })
      );
    });

    it('should emit event with correct payload', async () => {
      await service.logActivity({
        entityType: 'device',
        entityId: 'device-1',
        activityType: 'lock',
        title: 'Device Locked',
        actorType: 'user',
        actorId: 'user-1',
        actorName: 'John Doe',
        facilityId: 'facility-1',
      });

      expect(mockEventService.emitActivityLogged).toHaveBeenCalledWith(
        expect.objectContaining({
          activityId: 'activity-1',
          entityType: 'device',
          entityId: 'device-1',
          activityType: 'lock',
          title: 'Device Locked',
          actorType: 'user',
          actorId: 'user-1',
          actorName: 'John Doe',
          facilityId: 'facility-1',
        })
      );
    });
  });

  describe('getActivityLogs', () => {
    it('should get activity logs for admin without facility restriction', async () => {
      const result = await service.getActivityLogs(
        'admin-1',
        UserRole.ADMIN,
        undefined,
        { limit: 10 }
      );

      expect(result.activities).toHaveLength(1);
      expect(result.total).toBe(1);
      // Admin should not have facility_id or facility_ids in filters
      expect(mockActivityLogModel.findWithContext).toHaveBeenCalledWith(
        expect.not.objectContaining({
          facility_ids: expect.anything(),
        })
      );
    });

    it('should filter by specific facility for non-admin users', async () => {
      const result = await service.getActivityLogs(
        'user-1',
        UserRole.FACILITY_ADMIN,
        ['facility-1'],
        { facilityId: 'facility-1' }
      );

      expect(result.activities).toHaveLength(1);
      expect(mockActivityLogModel.findWithContext).toHaveBeenCalledWith(
        expect.objectContaining({
          facility_id: 'facility-1',
        })
      );
    });

    it('should use facility_ids for non-admin users without specific facility filter', async () => {
      await service.getActivityLogs(
        'user-1',
        UserRole.FACILITY_ADMIN,
        ['facility-1', 'facility-2'],
        {}
      );

      expect(mockActivityLogModel.findWithContext).toHaveBeenCalledWith(
        expect.objectContaining({
          facility_ids: ['facility-1', 'facility-2'],
        })
      );
    });

    it('should throw error when accessing unauthorized facility', async () => {
      await expect(
        service.getActivityLogs(
          'user-1',
          UserRole.FACILITY_ADMIN,
          ['facility-1'],
          { facilityId: 'facility-2' }
        )
      ).rejects.toThrow('Access denied');
    });

    it('should return empty for users with no facility access', async () => {
      const result = await service.getActivityLogs(
        'user-1',
        UserRole.TENANT,
        [],
        {}
      );

      expect(result.activities).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(mockActivityLogModel.findWithContext).not.toHaveBeenCalled();
    });

    it('should return empty when facility IDs are undefined for non-admin', async () => {
      const result = await service.getActivityLogs(
        'user-1',
        UserRole.TENANT,
        undefined,
        {}
      );

      // undefined facilityIds means no access
      expect(result.activities).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should pass all query filters to model', async () => {
      const fromDate = new Date('2026-01-01');
      const toDate = new Date('2026-02-01');

      await service.getActivityLogs(
        'admin-1',
        UserRole.ADMIN,
        undefined,
        {
          entityType: 'device',
          activityType: 'lock',
          actorType: 'user',
          result: 'success',
          unitId: 'unit-1',
          deviceId: 'device-1',
          fromDate,
          toDate,
          limit: 25,
          offset: 10,
        }
      );

      expect(mockActivityLogModel.findWithContext).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'device',
          activity_type: 'lock',
          actor_type: 'user',
          result: 'success',
          unit_id: 'unit-1',
          device_id: 'device-1',
          from_date: fromDate,
          to_date: toDate,
          limit: 25,
          offset: 10,
        })
      );
    });

    it('should use default limit and offset', async () => {
      await service.getActivityLogs(
        'admin-1',
        UserRole.ADMIN,
        undefined,
        {}
      );

      expect(mockActivityLogModel.findWithContext).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50,
          offset: 0,
        })
      );
    });

    it('should format activity logs with context in response', async () => {
      const result = await service.getActivityLogs(
        'admin-1',
        UserRole.ADMIN,
        undefined,
        {}
      );

      expect(result.activities[0]).toEqual(
        expect.objectContaining({
          unitNumber: 'A-101',
          deviceSerial: 'SN-12345',
          facilityName: 'Test Facility',
        })
      );
    });
  });

  describe('getFacilityActivity', () => {
    it('should get activity for authorized facility', async () => {
      const result = await service.getFacilityActivity(
        'user-1',
        UserRole.FACILITY_ADMIN,
        ['facility-1'],
        'facility-1'
      );

      expect(result.activities).toHaveLength(1);
      expect(mockActivityLogModel.findWithContext).toHaveBeenCalledWith(
        expect.objectContaining({
          facility_id: 'facility-1',
        })
      );
    });

    it('should throw error for unauthorized facility', async () => {
      await expect(
        service.getFacilityActivity(
          'user-1',
          UserRole.FACILITY_ADMIN,
          ['facility-1'],
          'facility-2'
        )
      ).rejects.toThrow('Access denied');
    });

    it('should allow admin to access any facility', async () => {
      const result = await service.getFacilityActivity(
        'admin-1',
        UserRole.ADMIN,
        undefined,
        'facility-1'
      );

      expect(result.activities).toHaveLength(1);
    });

    it('should pass date range and pagination options', async () => {
      const fromDate = new Date('2026-01-01');
      const toDate = new Date('2026-02-01');

      await service.getFacilityActivity(
        'admin-1',
        UserRole.ADMIN,
        undefined,
        'facility-1',
        { fromDate, toDate, limit: 25, offset: 10 }
      );

      expect(mockActivityLogModel.findWithContext).toHaveBeenCalledWith(
        expect.objectContaining({
          facility_id: 'facility-1',
          from_date: fromDate,
          to_date: toDate,
          limit: 25,
          offset: 10,
        })
      );
    });
  });

  describe('getUnitActivity', () => {
    it('should get activity for a unit as admin', async () => {
      const result = await service.getUnitActivity(
        'user-1',
        UserRole.ADMIN,
        undefined,
        'unit-1'
      );

      expect(result.activities).toHaveLength(1);
      expect(result.activities[0].unitNumber).toBe('A-101');
      expect(mockUnitModel.findById).toHaveBeenCalledWith('unit-1');
    });

    it('should throw NotFoundError when unit does not exist', async () => {
      mockUnitModel.findById.mockResolvedValue(null);

      await expect(
        service.getUnitActivity('user-1', UserRole.ADMIN, undefined, 'non-existent')
      ).rejects.toThrow('Unit');
    });

    it('should throw error when user lacks facility access', async () => {
      mockUnitModel.findById.mockResolvedValue({ id: 'unit-1', facility_id: 'facility-2' } as any);

      await expect(
        service.getUnitActivity('user-1', UserRole.FACILITY_ADMIN, ['facility-1'], 'unit-1')
      ).rejects.toThrow('Access denied');
    });

    it('should allow facility admin with correct facility access', async () => {
      const result = await service.getUnitActivity(
        'user-1',
        UserRole.FACILITY_ADMIN,
        ['facility-1'],
        'unit-1'
      );

      expect(result.activities).toHaveLength(1);
    });

    it('should check tenant assignment for tenant role', async () => {
      const result = await service.getUnitActivity(
        'user-1',
        UserRole.TENANT,
        ['facility-1'],
        'unit-1'
      );

      expect(result.activities).toHaveLength(1);
      expect(mockUnitAssignmentModel.findByUnitAndTenant).toHaveBeenCalledWith('unit-1', 'user-1');
    });

    it('should deny tenant without unit assignment', async () => {
      mockUnitAssignmentModel.findByUnitAndTenant.mockResolvedValue(null);

      await expect(
        service.getUnitActivity('user-1', UserRole.TENANT, ['facility-1'], 'unit-1')
      ).rejects.toThrow('You do not have access to this unit');
    });

    it('should pass pagination options', async () => {
      await service.getUnitActivity(
        'admin-1',
        UserRole.ADMIN,
        undefined,
        'unit-1',
        { limit: 25, offset: 10 }
      );

      expect(mockActivityLogModel.findWithContext).toHaveBeenCalledWith(
        expect.objectContaining({
          unit_id: 'unit-1',
          limit: 25,
          offset: 10,
        })
      );
    });
  });

  describe('getDeviceActivity', () => {
    it('should get activity for a blulok device', async () => {
      const result = await service.getDeviceActivity(
        'user-1',
        UserRole.ADMIN,
        undefined,
        'device-1'
      );

      expect(result.activities).toHaveLength(1);
      expect(result.activities[0].deviceSerial).toBe('SN-12345');
    });

    it('should get activity for access control device when blulok not found', async () => {
      mockDeviceModel.findBluLokDeviceById.mockResolvedValue(null);

      const result = await service.getDeviceActivity(
        'user-1',
        UserRole.ADMIN,
        undefined,
        'device-1'
      );

      expect(result.activities).toHaveLength(1);
    });

    it('should throw NotFoundError when neither device type exists', async () => {
      mockDeviceModel.findBluLokDeviceById.mockResolvedValue(null);
      mockDeviceModel.findAccessControlDeviceWithGateway.mockResolvedValue(null);

      await expect(
        service.getDeviceActivity('user-1', UserRole.ADMIN, undefined, 'non-existent')
      ).rejects.toThrow('Device');
    });

    it('should throw error when user lacks facility access to device', async () => {
      mockDeviceModel.findBluLokDeviceById.mockResolvedValue({ id: 'device-1', facility_id: 'facility-2' } as any);
      mockDeviceModel.findAccessControlDeviceWithGateway.mockResolvedValue({ id: 'device-1', facility_id: 'facility-2' } as any);

      await expect(
        service.getDeviceActivity('user-1', UserRole.FACILITY_ADMIN, ['facility-1'], 'device-1')
      ).rejects.toThrow('Access denied');
    });

    it('should pass pagination options', async () => {
      await service.getDeviceActivity(
        'admin-1',
        UserRole.ADMIN,
        undefined,
        'device-1',
        { limit: 25, offset: 10 }
      );

      expect(mockActivityLogModel.findWithContext).toHaveBeenCalledWith(
        expect.objectContaining({
          device_id: 'device-1',
          limit: 25,
          offset: 10,
        })
      );
    });

    it('should look up both device types in parallel', async () => {
      await service.getDeviceActivity(
        'user-1',
        UserRole.ADMIN,
        undefined,
        'device-1'
      );

      expect(mockDeviceModel.findBluLokDeviceById).toHaveBeenCalledWith('device-1');
      expect(mockDeviceModel.findAccessControlDeviceWithGateway).toHaveBeenCalledWith('device-1');
    });
  });

  describe('convenience methods', () => {
    it('should log lock event with correct fields', async () => {
      await service.logLockEvent(
        'device-1',
        'unit-1',
        'facility-1',
        true,
        'user',
        'user-1',
        'John Doe'
      );

      expect(mockActivityLogModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'device',
          entity_id: 'device-1',
          activity_type: 'lock',
          title: 'Device Locked',
          actor_type: 'user',
          actor_id: 'user-1',
          actor_name: 'John Doe',
          facility_id: 'facility-1',
          unit_id: 'unit-1',
          device_id: 'device-1',
        })
      );
    });

    it('should log unlock event', async () => {
      await service.logLockEvent(
        'device-1',
        'unit-1',
        'facility-1',
        false,
        'user',
        'user-1',
        'John Doe'
      );

      expect(mockActivityLogModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          activity_type: 'unlock',
          title: 'Device Unlocked',
        })
      );
    });

    it('should log successful access attempt', async () => {
      await service.logAccessAttempt(
        'device-1',
        'unit-1',
        'facility-1',
        'user-1',
        'John Doe',
        true
      );

      expect(mockActivityLogModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          activity_type: 'access_attempt',
          title: 'Access Granted',
          result: 'success',
          actor_type: 'user',
          actor_id: 'user-1',
        })
      );
    });

    it('should log failed access attempt with reason', async () => {
      await service.logAccessAttempt(
        'device-1',
        'unit-1',
        'facility-1',
        'user-1',
        'John Doe',
        false,
        'Outside access hours'
      );

      expect(mockActivityLogModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          activity_type: 'access_attempt',
          title: 'Access Denied',
          result: 'failure',
          result_message: 'Outside access hours',
        })
      );
    });

    it('should log status change with old and new status in metadata', async () => {
      await service.logStatusChange(
        'device-1',
        'facility-1',
        'online',
        'offline'
      );

      expect(mockActivityLogModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          activity_type: 'status_change',
          actor_type: 'system',
          metadata: expect.objectContaining({ oldStatus: 'online', newStatus: 'offline' }),
        })
      );
    });

    it('should log assignment (assigned) change with metadata', async () => {
      await service.logAssignmentChange(
        'unit-1',
        'facility-1',
        'user-1',
        'John Doe',
        true,
        'admin-1',
        'Admin User'
      );

      expect(mockActivityLogModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'unit',
          entity_id: 'unit-1',
          activity_type: 'assignment_change',
          title: 'User Assigned',
          actor_type: 'user',
          actor_id: 'admin-1',
          actor_name: 'Admin User',
          metadata: expect.objectContaining({
            assignedUserId: 'user-1',
            assignedUserName: 'John Doe',
            assigned: true,
          }),
        })
      );
    });

    it('should log unassignment change', async () => {
      await service.logAssignmentChange(
        'unit-1',
        'facility-1',
        'user-1',
        'John Doe',
        false,
        'admin-1',
        'Admin User'
      );

      expect(mockActivityLogModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          activity_type: 'assignment_change',
          title: 'User Unassigned',
          metadata: expect.objectContaining({ assigned: false }),
        })
      );
    });

    it('should use system actor when no performer provided for assignment', async () => {
      await service.logAssignmentChange(
        'unit-1',
        'facility-1',
        'user-1',
        'John Doe',
        true
      );

      expect(mockActivityLogModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actor_type: 'system',
        })
      );
    });
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ActivityService.getInstance();
      const instance2 = ActivityService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });
});
