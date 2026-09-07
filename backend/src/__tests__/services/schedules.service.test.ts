import { SchedulesService, UserContext } from '@/services/schedules.service';
import { ScheduleModel } from '@/models/schedule.model';
import { UserFacilityScheduleModel } from '@/models/user-facility-schedule.model';
import { UserRole } from '@/types/auth.types';
import { v4 as uuidv4 } from 'uuid';

// Mock the models
jest.mock('@/models/schedule.model');
jest.mock('@/models/user-facility-schedule.model');
jest.mock('@/models/user.model');
jest.mock('@/services/facility-access.service');
jest.mock('@/services/auth.service');

describe('SchedulesService', () => {
  let facilityId: string;
  let userId: string;
  let userContext: UserContext;

  beforeEach(() => {
    facilityId = uuidv4();
    userId = uuidv4();
    userContext = {
      userId,
      role: UserRole.ADMIN,
      facilityIds: [facilityId],
    };
  });

  describe('getSchedulesForFacility', () => {
    it('should return schedules for admins', async () => {
      const mockSchedules = [
        {
          id: uuidv4(),
          facility_id: facilityId,
          name: 'Test Schedule',
          schedule_type: 'custom',
          is_active: true,
          time_windows: [],
        },
      ];

      (ScheduleModel.findByFacilityWithTimeWindows as jest.Mock).mockResolvedValue(mockSchedules);
      const { FacilityAccessService } = await import('@/services/facility-access.service');
      (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(true);
      const { AuthService } = await import('@/services/auth.service');
      (AuthService.isAdmin as jest.Mock).mockReturnValue(true);

      const result = await SchedulesService.getSchedulesForFacility(facilityId, userContext);
      expect(result).toEqual(mockSchedules);
    });
  });

  describe('createSchedule', () => {
    it('should create a schedule with time windows', async () => {
      const mockSchedule = {
        id: uuidv4(),
        facility_id: facilityId,
        name: 'New Schedule',
        schedule_type: 'custom',
        is_active: true,
        time_windows: [
          { day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00' },
        ],
      };

      (ScheduleModel.createWithTimeWindows as jest.Mock).mockResolvedValue(mockSchedule);
      const { FacilityAccessService } = await import('@/services/facility-access.service');
      (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(true);
      const { AuthService } = await import('@/services/auth.service');
      (AuthService.isAdmin as jest.Mock).mockReturnValue(true);

      const result = await SchedulesService.createSchedule(
        facilityId,
        {
          name: 'New Schedule',
          schedule_type: 'custom',
          is_active: true,
        },
        [{ day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00' }],
        userContext
      );

      expect(result).toEqual(mockSchedule);
      expect(ScheduleModel.createWithTimeWindows).toHaveBeenCalled();
    });
  });

  describe('initializeDefaultSchedules', () => {
    it('should create default schedules for a facility', async () => {
      (ScheduleModel.findByFacility as jest.Mock).mockResolvedValue([]);
      (ScheduleModel.createWithTimeWindows as jest.Mock).mockResolvedValue({ id: uuidv4() });

      await SchedulesService.initializeDefaultSchedules(facilityId);

      expect(ScheduleModel.createWithTimeWindows).toHaveBeenCalledTimes(2);
    });
  });

  describe('getScheduleUsage', () => {
    it('should return usage counts for a schedule', async () => {
      const scheduleId = uuidv4();
      const tenantUserId = uuidv4();
      const maintenanceUserId = uuidv4();

      const mockUserSchedules = [
        { user_id: tenantUserId, facility_id: facilityId, schedule_id: scheduleId },
        { user_id: maintenanceUserId, facility_id: facilityId, schedule_id: scheduleId },
      ];

      (UserFacilityScheduleModel.getUsersForSchedule as jest.Mock).mockResolvedValue(mockUserSchedules);
      
      const { UserModel } = await import('@/models/user.model');
      (UserModel.findByIds as jest.Mock) = jest.fn().mockResolvedValue([
        { id: tenantUserId, role: 'tenant' },
        { id: maintenanceUserId, role: 'maintenance' },
      ]);

      const { FacilityAccessService } = await import('@/services/facility-access.service');
      (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(true);
      const { AuthService } = await import('@/services/auth.service');
      (AuthService.isAdmin as jest.Mock).mockReturnValue(true);

      const usage = await SchedulesService.getScheduleUsage(facilityId, scheduleId, userContext);

      expect(usage.tenantCount).toBe(1);
      expect(usage.maintenanceCount).toBe(1);
      expect(usage.totalCount).toBe(2);
    });
  });

  describe('deleteSchedule', () => {
    it('should reassign users to default schedules when deleting', async () => {
      const scheduleId = uuidv4();
      const tenantUserId = uuidv4();
      const defaultTenantScheduleId = uuidv4();
      const defaultMaintenanceScheduleId = uuidv4();

      const mockSchedule = {
        id: scheduleId,
        facility_id: facilityId,
        name: 'Custom Schedule',
        schedule_type: 'custom',
        is_active: true,
      };

      const mockUserSchedules = [
        { user_id: tenantUserId, facility_id: facilityId, schedule_id: scheduleId },
      ];

      (ScheduleModel.findById as jest.Mock).mockResolvedValue(mockSchedule);
      (UserFacilityScheduleModel.getUsersForSchedule as jest.Mock).mockResolvedValue(mockUserSchedules);
      
      const { UserModel } = await import('@/models/user.model');
      (UserModel.findByIds as jest.Mock) = jest.fn().mockResolvedValue([
        { id: tenantUserId, role: 'tenant' },
      ]);

      (ScheduleModel.findByFacility as jest.Mock).mockResolvedValue([
        { id: defaultTenantScheduleId, name: 'Default Tenant Schedule', schedule_type: 'precanned', is_active: true },
        { id: defaultMaintenanceScheduleId, name: 'Maintenance Schedule', schedule_type: 'precanned', is_active: true },
      ]);

      (UserFacilityScheduleModel.setUserSchedule as jest.Mock) = jest.fn().mockResolvedValue({
        id: uuidv4(),
        user_id: tenantUserId,
        facility_id: facilityId,
        schedule_id: defaultTenantScheduleId,
      });

      (ScheduleModel.deleteById as jest.Mock).mockResolvedValue(1);

      const { FacilityAccessService } = await import('@/services/facility-access.service');
      (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(true);
      const { AuthService } = await import('@/services/auth.service');
      (AuthService.isAdmin as jest.Mock).mockReturnValue(true);

      await SchedulesService.deleteSchedule(facilityId, scheduleId, userContext);

      expect(UserFacilityScheduleModel.setUserSchedule).toHaveBeenCalledWith(
        tenantUserId,
        facilityId,
        defaultTenantScheduleId,
        userId
      );
      expect(ScheduleModel.deleteById).toHaveBeenCalledWith(scheduleId);
    });

    it('should prevent deletion of precanned schedules', async () => {
      const scheduleId = uuidv4();
      const mockSchedule = {
        id: scheduleId,
        facility_id: facilityId,
        name: 'Default Tenant Schedule',
        schedule_type: 'precanned',
        is_active: true,
      };

      (ScheduleModel.findById as jest.Mock).mockResolvedValue(mockSchedule);
      const { FacilityAccessService } = await import('@/services/facility-access.service');
      (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(true);
      const { AuthService } = await import('@/services/auth.service');
      (AuthService.isAdmin as jest.Mock).mockReturnValue(true);

      await expect(
        SchedulesService.deleteSchedule(facilityId, scheduleId, userContext)
      ).rejects.toThrow('Precanned schedules cannot be deleted');
    });
  });

  describe('branch coverage', () => {
    const scheduleId = uuidv4();
    const adminCtx = (uid: string): UserContext => ({
      userId: uid,
      role: UserRole.ADMIN,
    });

    it('getSchedulesForFacility throws when facility access denied', async () => {
      const { FacilityAccessService } = await import('@/services/facility-access.service');
      (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(false);

      await expect(
        SchedulesService.getSchedulesForFacility(facilityId, adminCtx(userId))
      ).rejects.toThrow(/Access denied to this facility/);
    });

    it('getSchedulesForFacility returns tenant-assigned schedule only', async () => {
      const sched = {
        id: scheduleId,
        facility_id: facilityId,
        name: 'Mine',
        schedule_type: 'custom',
        is_active: true,
        time_windows: [],
      };
      const { FacilityAccessService } = await import('@/services/facility-access.service');
      (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(true);
      const { AuthService } = await import('@/services/auth.service');
      (AuthService.isAdmin as jest.Mock).mockReturnValue(false);
      (AuthService.isFacilityAdmin as jest.Mock).mockReturnValue(false);

      (UserFacilityScheduleModel.getUserScheduleForFacilityWithDetails as jest.Mock).mockResolvedValue({
        schedule: sched,
      });

      const ctx: UserContext = { userId, role: UserRole.TENANT };
      const out = await SchedulesService.getSchedulesForFacility(facilityId, ctx);
      expect(out).toEqual([sched]);
    });

    it('getSchedule throws when schedule missing', async () => {
      const { FacilityAccessService } = await import('@/services/facility-access.service');
      (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(true);
      (ScheduleModel.findByIdWithTimeWindows as jest.Mock).mockResolvedValue(null);
      const { AuthService } = await import('@/services/auth.service');
      (AuthService.isAdmin as jest.Mock).mockReturnValue(true);

      await expect(
        SchedulesService.getSchedule(facilityId, scheduleId, adminCtx(userId))
      ).rejects.toThrow(/Schedule not found/);
    });

    it('getSchedule throws when schedule facility mismatches', async () => {
      const { FacilityAccessService } = await import('@/services/facility-access.service');
      (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(true);
      (ScheduleModel.findByIdWithTimeWindows as jest.Mock).mockResolvedValue({
        id: scheduleId,
        facility_id: 'other-facility',
        name: 'X',
        schedule_type: 'custom',
        is_active: true,
        time_windows: [],
      });
      const { AuthService } = await import('@/services/auth.service');
      (AuthService.isAdmin as jest.Mock).mockReturnValue(true);

      await expect(
        SchedulesService.getSchedule(facilityId, scheduleId, adminCtx(userId))
      ).rejects.toThrow(/does not belong to this facility/);
    });

    it('updateSchedule updates when admin', async () => {
      const updated = {
        id: scheduleId,
        facility_id: facilityId,
        name: 'U',
        schedule_type: 'custom',
        is_active: true,
        time_windows: [],
      };
      (ScheduleModel.findById as jest.Mock).mockResolvedValue({
        id: scheduleId,
        facility_id: facilityId,
        schedule_type: 'custom',
      });
      (ScheduleModel.updateWithTimeWindows as jest.Mock).mockResolvedValue(updated);
      const { FacilityAccessService } = await import('@/services/facility-access.service');
      (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(true);
      const { AuthService } = await import('@/services/auth.service');
      (AuthService.isAdmin as jest.Mock).mockReturnValue(true);
      (AuthService.isFacilityAdmin as jest.Mock).mockReturnValue(false);

      const result = await SchedulesService.updateSchedule(
        facilityId,
        scheduleId,
        adminCtx(userId),
        { name: 'U' },
        [{ day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00' }]
      );
      expect(result).toEqual(updated);
    });

    it('getScheduleUsage throws for tenant', async () => {
      const sid = uuidv4();
      const { AuthService } = await import('@/services/auth.service');
      (AuthService.isAdmin as jest.Mock).mockReturnValue(false);
      (AuthService.isFacilityAdmin as jest.Mock).mockReturnValue(false);

      await expect(
        SchedulesService.getScheduleUsage(facilityId, sid, {
          userId,
          role: UserRole.TENANT,
        })
      ).rejects.toThrow(/Insufficient permissions/);
    });

    it('setUserSchedule assigns schedule for admin', async () => {
      const sid = uuidv4();
      const detail = {
        id: uuidv4(),
        user_id: userId,
        facility_id: facilityId,
        schedule_id: sid,
        schedule: {
          id: sid,
          facility_id: facilityId,
          name: 'S',
          schedule_type: 'custom',
          is_active: true,
          time_windows: [],
        },
      };
      (ScheduleModel.findById as jest.Mock).mockResolvedValue({
        id: sid,
        facility_id: facilityId,
      });
      (UserFacilityScheduleModel.setUserSchedule as jest.Mock).mockResolvedValue(detail);
      (UserFacilityScheduleModel.getUserScheduleForFacilityWithDetails as jest.Mock).mockResolvedValue(detail);

      const { FacilityAccessService } = await import('@/services/facility-access.service');
      (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(true);
      const { AuthService } = await import('@/services/auth.service');
      (AuthService.canManageUsers as jest.Mock).mockReturnValue(true);

      const out = await SchedulesService.setUserSchedule(userId, facilityId, sid, {
        userId: 'admin-1',
        role: UserRole.ADMIN,
      });
      expect(out.schedule.id).toBe(sid);
    });

    it('listUserScheduleAssignments returns facility rows for admins', async () => {
      (UserFacilityScheduleModel.listAssignmentsForFacility as jest.Mock).mockResolvedValue([
        { user_id: 'u1', schedule_id: 's1' },
      ]);
      const { FacilityAccessService } = await import('@/services/facility-access.service');
      (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(true);
      const { AuthService } = await import('@/services/auth.service');
      (AuthService.isAdmin as jest.Mock).mockReturnValue(true);
      (AuthService.isFacilityAdmin as jest.Mock).mockReturnValue(false);

      const rows = await SchedulesService.listUserScheduleAssignments(facilityId, userContext);
      expect(rows).toEqual([{ userId: 'u1', scheduleId: 's1' }]);
    });

    it('listUserScheduleAssignments rejects tenants', async () => {
      const { FacilityAccessService } = await import('@/services/facility-access.service');
      (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(true);
      const { AuthService } = await import('@/services/auth.service');
      (AuthService.isAdmin as jest.Mock).mockReturnValue(false);
      (AuthService.isFacilityAdmin as jest.Mock).mockReturnValue(false);

      await expect(
        SchedulesService.listUserScheduleAssignments(facilityId, {
          userId: 'tenant-self',
          role: UserRole.TENANT,
        }),
      ).rejects.toThrow(/Insufficient permissions/);
    });

    it('getUserScheduleForFacility rejects non-admin viewing other user', async () => {
      await expect(
        SchedulesService.getUserScheduleForFacility('other-user', facilityId, {
          userId: 'tenant-self',
          role: UserRole.TENANT,
        })
      ).rejects.toThrow(/Insufficient permissions/);
    });

    it('initializeDefaultSchedules skips when precanned schedules exist', async () => {
      (ScheduleModel.findByFacility as jest.Mock).mockResolvedValue([{ id: 'existing' }]);
      await SchedulesService.initializeDefaultSchedules(facilityId);
      expect(ScheduleModel.createWithTimeWindows).not.toHaveBeenCalled();
    });
  });
});

