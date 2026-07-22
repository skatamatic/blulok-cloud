import { unitHasTenant } from '@/utils/unit-has-tenant.utils';

describe('unitHasTenant', () => {
  it('returns true when unit_assignments has a row', async () => {
    const knex = jest.fn((table: string) => {
      expect(table).toBe('unit_assignments');
      return {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ id: 'ua-1' }),
      };
    }) as unknown as import('knex').Knex;

    await expect(unitHasTenant(knex, 'unit-1')).resolves.toBe(true);
  });

  it('returns true for an active non-expired key share', async () => {
    const keySharingChain = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ id: 'ks-1' }),
    };
    const knex = jest.fn((table: string) => {
      if (table === 'unit_assignments') {
        return {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(null),
        };
      }
      expect(table).toBe('key_sharing');
      return keySharingChain;
    }) as unknown as import('knex').Knex;
    (knex as unknown as { fn: { now: jest.Mock } }).fn = { now: jest.fn() };

    await expect(unitHasTenant(knex, 'unit-1')).resolves.toBe(true);
    expect(keySharingChain.where).toHaveBeenCalledWith({
      unit_id: 'unit-1',
      is_active: true,
    });
  });

  it('returns false when vacant (no assignment, no active share)', async () => {
    const knex = jest.fn((table: string) => ({
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
    })) as unknown as import('knex').Knex;
    (knex as unknown as { fn: { now: jest.Mock } }).fn = { now: jest.fn() };

    await expect(unitHasTenant(knex, 'unit-1')).resolves.toBe(false);
  });
});
