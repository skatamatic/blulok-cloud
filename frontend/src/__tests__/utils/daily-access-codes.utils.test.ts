import {
  groupDailyAccessCodes,
  limitDailyAccessCodeGroups,
  sharedValidUntil,
} from '@/utils/daily-access-codes.utils';
import { UserAccessCode } from '@/types/facility.types';

const baseEntry = (overrides: Partial<UserAccessCode> = {}): UserAccessCode => ({
  device_id: 'device-1',
  access_id: 'access-1',
  relay_channel: 1,
  device_name: 'Access Control 1',
  device_type: 'door',
  location_description: 'Gateway relay 1',
  code: '111111',
  valid_until: '2026-06-13T14:56:13.000Z',
  schedule_id: null,
  schedule_name: 'Always-on',
  ...overrides,
});

describe('daily-access-codes.utils', () => {
  it('groups entries by type, device, and schedule', () => {
    const groups = groupDailyAccessCodes([
      {
        ...baseEntry({ schedule_name: 'Maintenance Schedule', code: '393781', schedule_id: 's3' }),
      },
      {
        ...baseEntry({ schedule_name: 'Always-on', code: '793740', schedule_id: 's1' }),
      },
      {
        ...baseEntry({
          device_id: 'device-2',
          device_name: 'Gate A',
          device_type: 'gate',
          schedule_name: 'Always-on',
          code: '1234',
        }),
      },
      {
        ...baseEntry({
          schedule_name: 'Default Tenant Schedule',
          code: '031754',
          schedule_id: 's2',
        }),
      },
    ]);

    expect(groups.map((group) => group.label)).toEqual(['Doors', 'Gates']);
    expect(groups[0].devices).toHaveLength(1);
    expect(groups[0].devices[0].schedules.map((row) => row.scheduleName)).toEqual([
      'Always-on',
      'Default Tenant Schedule',
      'Maintenance Schedule',
    ]);
    expect(groups[1].devices[0].deviceName).toBe('Gate A');
  });

  it('limits schedule rows while preserving grouping', () => {
    const groups = groupDailyAccessCodes([
      baseEntry({ schedule_name: 'Always-on', code: '1' }),
      baseEntry({ schedule_name: 'Schedule B', code: '2', schedule_id: 'b' }),
      baseEntry({ schedule_name: 'Schedule C', code: '3', schedule_id: 'c' }),
    ]);

    const limited = limitDailyAccessCodeGroups(groups, 2);
    expect(limited.hiddenCount).toBe(1);
    expect(limited.groups[0].devices[0].schedules).toHaveLength(2);
  });

  it('returns shared valid-until when all schedules match', () => {
    const schedules = [
      { scheduleId: 'a', scheduleName: 'Always-on', code: '1', validUntil: '2026-06-13T14:56:13.000Z' },
      { scheduleId: 'b', scheduleName: 'Maintenance', code: '2', validUntil: '2026-06-13T14:56:13.000Z' },
    ];
    expect(sharedValidUntil(schedules)).toBe('2026-06-13T14:56:13.000Z');
  });
});
