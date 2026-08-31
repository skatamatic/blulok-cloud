import { describe, expect, it } from '@jest/globals';
import { applyBlulokZoneLockMatch } from '@/utils/blulok-zone-lock-match.utils';

jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: jest.fn(() => ({
      connection: Object.assign(
        jest.fn((table: string) => {
          const chain: Record<string, jest.Mock> = {};
          const self = () => chain;
          for (const method of ['select', 'where', 'andWhere', 'whereIn', 'orWhereIn', 'whereRaw']) {
            chain[method] = jest.fn().mockReturnValue(chain);
          }
          chain.toSQL = jest.fn(() => ({ sql: `mock ${table}`, bindings: [] }));
          return chain;
        }),
        {
          fn: { now: jest.fn() },
        },
      ),
    })),
  },
}));

describe('applyBlulokZoneLockMatch', () => {
  it('adds a false guard when no unit or device ids are provided', () => {
    const { DatabaseService } = require('@/services/database.service');
    const knex = DatabaseService.getInstance().connection;
    const qb = knex('device_group_members as zone_lock');
    applyBlulokZoneLockMatch(qb, 'zone_lock', {});
    expect(qb.whereRaw).toHaveBeenCalledWith('1 = 0');
  });
});
