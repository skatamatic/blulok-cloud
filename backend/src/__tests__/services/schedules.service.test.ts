import { SchedulesService, UserContext } from '@/services/schedules.service';
import { ScheduleModel } from '@/models/schedule.model';
import { UserFacilityScheduleModel } from '@/models/user-facility-schedule.model';
import { UserRole } from '@/types/auth.types';
import { DatabaseService } from '@/services/database.service';
import { v4 as uuidv4 } from 'uuid';

// Mock the models
jest.mock('@/models/schedule.model');
jest.mock('@/models/user-facility-schedule.model');
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
});

