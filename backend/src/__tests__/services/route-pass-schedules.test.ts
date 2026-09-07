import type { Knex } from 'knex';
import {
  buildFacilitySchedulePayload,
  daySlotsToScheduleBands,
  expandScheduleWindowsToDaySlots,
  mergeConsecutiveDaysToRanges,
  normalizeTimeForRoutePass,
  parseRoutePassAudiences,
  resolveDistinctFacilityIdsFromAudiences,
} from '@/services/passes/route-pass-schedules';

describe('route-pass-schedules', () => {
  describe('parseRoutePassAudiences', () => {
    it('parses lock, shared_key, and access_control entries', () => {
      const p = parseRoutePassAudiences([
        'lock:ABC',
        'shared_key:owner-1:ABC',
        'access_control:dev-uuid',
        'ignore:me',
      ]);
      expect(p.lockSerials).toEqual(['ABC']);
      expect(p.sharedKeys).toEqual([{ primaryTenantId: 'owner-1', lockSerial: 'ABC' }]);
      expect(p.accessControlDeviceIds).toEqual(['dev-uuid']);
    });
  });

  describe('normalizeTimeForRoutePass', () => {
    it('strips :00 seconds', () => {
      expect(normalizeTimeForRoutePass('09:00:00')).toBe('09:00');
    });
    it('preserves non-zero seconds', () => {
      expect(normalizeTimeForRoutePass('09:00:30')).toBe('09:00:30');
    });
  });

  describe('mergeConsecutiveDaysToRanges', () => {
    it('merges Mon–Fri', () => {
      expect(mergeConsecutiveDaysToRanges([1, 2, 3, 4, 5])).toEqual([[1, 5]]);
    });
    it('splits Sat and Sun', () => {
      expect(mergeConsecutiveDaysToRanges([0, 6])).toEqual([[0, 0], [6, 6]]);
    });
    it('all week', () => {
      expect(mergeConsecutiveDaysToRanges([0, 1, 2, 3, 4, 5, 6])).toEqual([[0, 6]]);
    });
  });

  describe('daySlotsToScheduleBands', () => {
    it('buckets identical times across weekdays', () => {
      const slots = expandScheduleWindowsToDaySlots([
        { day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00' },
        { day_of_week: 2, start_time: '09:00:00', end_time: '17:00:00' },
        { day_of_week: 3, start_time: '09:00:00', end_time: '17:00:00' },
        { day_of_week: 4, start_time: '09:00:00', end_time: '17:00:00' },
        { day_of_week: 5, start_time: '09:00:00', end_time: '17:00:00' },
      ]);
      const bands = daySlotsToScheduleBands(slots);
      expect(bands).toEqual([[ [[1, 5]], '09:00', '17:00' ]]);
    });

    it('weekend band uses two ranges', () => {
      const slots = expandScheduleWindowsToDaySlots([
        { day_of_week: 0, start_time: '10:00:00', end_time: '14:00:00' },
        { day_of_week: 6, start_time: '10:00:00', end_time: '14:00:00' },
      ]);
      const bands = daySlotsToScheduleBands(slots);
      expect(bands).toEqual([[ [[0, 0], [6, 6]], '10:00', '14:00' ]]);
    });
  });

  describe('buildFacilitySchedulePayload', () => {
    it('returns null for empty windows', () => {
      expect(buildFacilitySchedulePayload('fac', [])).toBeNull();
    });
  });

  describe('resolveDistinctFacilityIdsFromAudiences', () => {
    it('merges facility ids from locks and access control', async () => {
      const wrap = (rows: any[]) => {
        const q: any = {
          join: jest.fn().mockReturnThis(),
          whereIn: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
        };
        q.then = (resolve: any) => Promise.resolve(rows).then(resolve);
        return q;
      };
      const knex: any = jest.fn((table: string) => {
        if (String(table).includes('blulok_devices')) {
          return wrap([{ device_serial: 'L1', facility_id: 'f-b' }, { device_serial: 'L2', facility_id: 'f-a' }]);
        }
        if (String(table).includes('access_control_devices')) {
          return wrap([{ id: 'ac1', facility_id: 'f-c' }]);
        }
        return wrap([]);
      });

      const ids = await resolveDistinctFacilityIdsFromAudiences(knex as Knex, [
        'lock:L1',
        'lock:L2',
        'access_control:ac1',
      ]);
      expect(ids).toEqual(['f-a', 'f-b', 'f-c']);
    });
  });
});
