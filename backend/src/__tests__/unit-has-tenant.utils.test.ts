import { unitHasTenant } from '@/utils/unit-has-tenant.utils';

function chainWithWhereAndFirst(first: jest.Mock) {
  const api: { where: jest.Mock; first: jest.Mock } = {
    where: jest.fn(),
    first,
  };
  api.where.mockReturnValue(api);
  return api;
}

describe('unitHasTenant', () => {
  it('returns true when unit_assignments has a non-expired row', async () => {
    const first = jest.fn().mockResolvedValue({ id: 'ua-1' });
    const assignmentChain = chainWithWhereAndFirst(first);
    const knex = jest.fn((table: string) => {
      expect(table).toBe('unit_assignments');
      return assignmentChain;
    }) as unknown as import('knex').Knex;
    (knex as unknown as { fn: { now: jest.Mock } }).fn = { now: jest.fn() };

    await expect(unitHasTenant(knex, 'unit-1')).resolves.toBe(true);
    expect(assignmentChain.where).toHaveBeenCalledWith({ unit_id: 'unit-1' });
  });

  it('returns true for an active non-expired key share', async () => {
    const assignmentFirst = jest.fn().mockResolvedValue(null);
    const sharingFirst = jest.fn().mockResolvedValue({ id: 'ks-1' });
    const assignmentChain = chainWithWhereAndFirst(assignmentFirst);
    const sharingChain = chainWithWhereAndFirst(sharingFirst);
    const knex = jest.fn((table: string) => {
      if (table === 'unit_assignments') return assignmentChain;
      expect(table).toBe('key_sharing');
      return sharingChain;
    }) as unknown as import('knex').Knex;
    (knex as unknown as { fn: { now: jest.Mock } }).fn = { now: jest.fn() };

    await expect(unitHasTenant(knex, 'unit-1')).resolves.toBe(true);
    expect(sharingChain.where).toHaveBeenCalledWith({
      unit_id: 'unit-1',
      is_active: true,
    });
  });

  it('returns false when vacant (no assignment, no active share)', async () => {
    const knex = jest.fn(() => chainWithWhereAndFirst(jest.fn().mockResolvedValue(null))) as unknown as import('knex').Knex;
    (knex as unknown as { fn: { now: jest.Mock } }).fn = { now: jest.fn() };

    await expect(unitHasTenant(knex, 'unit-1')).resolves.toBe(false);
  });

  it('ignores expired assignments when checking occupancy', async () => {
    const assignmentFirst = jest.fn().mockResolvedValue(null);
    const sharingFirst = jest.fn().mockResolvedValue(null);
    const assignmentChain = chainWithWhereAndFirst(assignmentFirst);
    const sharingChain = chainWithWhereAndFirst(sharingFirst);
    const knex = jest.fn((table: string) => {
      if (table === 'unit_assignments') return assignmentChain;
      return sharingChain;
    }) as unknown as import('knex').Knex;
    (knex as unknown as { fn: { now: jest.Mock } }).fn = { now: jest.fn() };

    await expect(unitHasTenant(knex, 'unit-1')).resolves.toBe(false);
    expect(assignmentChain.where).toHaveBeenCalledTimes(2);
  });
});
