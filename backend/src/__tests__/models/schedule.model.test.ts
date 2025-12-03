import { ScheduleModel, Schedule, ScheduleTimeWindow } from '@/models/schedule.model';
import { DatabaseService } from '@/services/database.service';
import { v4 as uuidv4 } from 'uuid';

describe('ScheduleModel', () => {
  let db: any;
  let facilityId: string;

  beforeAll(async () => {
    db = DatabaseService.getInstance().connection;
    // Create a test facility
    facilityId = uuidv4();
    await db('facilities').insert({
      id: facilityId,
      name: 'Test Facility',
      address: '123 Test St',
      city: 'Test City',
      state: 'TS',
      zip_code: '12345',
      country: 'US',
      is_active: true,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });
  });

  afterAll(async () => {
    // Cleanup
    await db('schedule_time_windows').where('schedule_id', 'like', '%').del();
    await db('schedules').where('facility_id', facilityId).del();
    await db('facilities').where('id', facilityId).del();
  });

  describe('createWithTimeWindows', () => {
    it('should create a schedule with time windows', async () => {
      const schedule = await ScheduleModel.createWithTimeWindows(
        {
          facility_id: facilityId,
          name: 'Test Schedule',
          schedule_type: 'custom',
          is_active: true,
          created_by: null,
        },
        [
          { day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00' },
          { day_of_week: 2, start_time: '09:00:00', end_time: '17:00:00' },
        ]
      );

      expect(schedule).toBeDefined();
      expect(schedule.name).toBe('Test Schedule');
      expect(schedule.time_windows).toHaveLength(2);
      expect(schedule.time_windows[0].day_of_week).toBe(1);
    });
  });

  describe('findByFacility', () => {
    it('should find schedules for a facility', async () => {
      const schedules = await ScheduleModel.findByFacility(facilityId);
      expect(Array.isArray(schedules)).toBe(true);
    });
  });

  describe('findByIdWithTimeWindows', () => {
    it('should find schedule with time windows', async () => {
      const created = await ScheduleModel.createWithTimeWindows(
        {
          facility_id: facilityId,
          name: 'Test Schedule 2',
          schedule_type: 'custom',
          is_active: true,
          created_by: null,
        },
        [{ day_of_week: 0, start_time: '00:00:00', end_time: '23:59:59' }]
      );

      const found = await ScheduleModel.findByIdWithTimeWindows(created.id);
      expect(found).toBeDefined();
      expect(found?.time_windows).toHaveLength(1);
    });
  });

  describe('updateWithTimeWindows', () => {
    it('should update schedule and time windows', async () => {
      const created = await ScheduleModel.createWithTimeWindows(
        {
          facility_id: facilityId,
          name: 'Test Schedule 3',
          schedule_type: 'custom',
          is_active: true,
          created_by: null,
        },
        [{ day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00' }]
      );

      const updated = await ScheduleModel.updateWithTimeWindows(
        created.id,
        { name: 'Updated Schedule' },
        [{ day_of_week: 1, start_time: '08:00:00', end_time: '18:00:00' }]
      );

      expect(updated.name).toBe('Updated Schedule');
      expect(updated.time_windows).toHaveLength(1);
      expect(updated.time_windows[0].start_time).toBe('08:00:00');
    });
  });
});

