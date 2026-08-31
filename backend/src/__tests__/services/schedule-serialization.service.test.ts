import {
  serializeScheduleForTransport,
  serializeScheduleTimeWindow,
} from '@/services/schedules/schedule-serialization.service';

describe('schedule-serialization.service', () => {
  it('serializes individual schedule window fields', () => {
    expect(serializeScheduleTimeWindow({
      day_of_week: 1,
      start_time: '08:00:00',
      end_time: '17:00:00',
    })).toEqual({
      day_of_week: 1,
      start_time: '08:00:00',
      end_time: '17:00:00',
    });
  });

  it('sorts time windows by day then start time', () => {
    const serialized = serializeScheduleForTransport({
      facilityId: 'fac-1',
      timeWindows: [
        { day_of_week: 5, start_time: '12:00:00', end_time: '13:00:00' },
        { day_of_week: 1, start_time: '18:00:00', end_time: '20:00:00' },
        { day_of_week: 1, start_time: '09:00:00', end_time: '12:00:00' },
      ] as any,
    });

    expect(serialized).toEqual({
      facility_id: 'fac-1',
      time_windows: [
        { day_of_week: 1, start_time: '09:00:00', end_time: '12:00:00' },
        { day_of_week: 1, start_time: '18:00:00', end_time: '20:00:00' },
        { day_of_week: 5, start_time: '12:00:00', end_time: '13:00:00' },
      ],
    });
  });

  it('drops invalid time windows from serialized output', () => {
    const serialized = serializeScheduleForTransport({
      facilityId: 'fac-1',
      timeWindows: [
        { day_of_week: 1, start_time: '09:00:00', end_time: '12:00:00' },
        { day_of_week: -1, start_time: '09:00:00', end_time: '12:00:00' },
        { day_of_week: 8, start_time: '09:00:00', end_time: '12:00:00' },
        { day_of_week: 2, start_time: '', end_time: '12:00:00' },
      ] as any,
    });

    expect(serialized).toEqual({
      facility_id: 'fac-1',
      time_windows: [
        { day_of_week: 1, start_time: '09:00:00', end_time: '12:00:00' },
      ],
    });
  });
});

