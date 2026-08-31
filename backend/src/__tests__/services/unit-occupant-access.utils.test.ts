import {
  userIsUnitOccupantOrShareRecipient,
} from '@/utils/unit-occupant-access.utils';

function chainWithWhereAndFirst(first: jest.Mock) {
  const api: { where: jest.Mock; first: jest.Mock } = {
    where: jest.fn(),
    first,
  };
  api.where.mockReturnValue(api);
  return api;
}

describe('unit-occupant-access.utils', () => {
  it('returns true for non-expired unit assignment', async () => {
    const first = jest.fn().mockResolvedValue({ id: 'a1' });
    const assignmentChain = chainWithWhereAndFirst(first);
    const knex = jest.fn((table: string) => {
      if (table === 'unit_assignments') return assignmentChain;
      throw new Error(`unexpected ${table}`);
    }) as unknown as import('knex').Knex;
    (knex as unknown as { fn: { now: jest.Mock } }).fn = { now: jest.fn() };

    await expect(userIsUnitOccupantOrShareRecipient(knex, 'u1', 't1')).resolves.toBe(true);
    expect(knex).toHaveBeenCalledWith('unit_assignments');
    expect(assignmentChain.where).toHaveBeenCalledWith({ unit_id: 'u1', tenant_id: 't1' });
  });

  it('returns true for active key share when no assignment', async () => {
    const assignmentFirst = jest.fn().mockResolvedValue(null);
    const sharingFirst = jest.fn().mockResolvedValue({ id: 's1' });
    const assignmentChain = chainWithWhereAndFirst(assignmentFirst);
    const sharingChain = chainWithWhereAndFirst(sharingFirst);

    const knex = jest.fn((table: string) => {
      if (table === 'unit_assignments') return assignmentChain;
      if (table === 'key_sharing') return sharingChain;
      throw new Error(`unexpected ${table}`);
    }) as unknown as import('knex').Knex;
    (knex as unknown as { fn: { now: jest.Mock } }).fn = { now: jest.fn() };

    await expect(userIsUnitOccupantOrShareRecipient(knex, 'u1', 't1')).resolves.toBe(true);
  });

  it('returns false when neither assignment nor share', async () => {
    const assignmentFirst = jest.fn().mockResolvedValue(null);
    const sharingFirst = jest.fn().mockResolvedValue(null);
    const assignmentChain = chainWithWhereAndFirst(assignmentFirst);
    const sharingChain = chainWithWhereAndFirst(sharingFirst);

    const knex = jest.fn((table: string) => {
      if (table === 'unit_assignments') return assignmentChain;
      if (table === 'key_sharing') return sharingChain;
      throw new Error(`unexpected ${table}`);
    }) as unknown as import('knex').Knex;
    (knex as unknown as { fn: { now: jest.Mock } }).fn = { now: jest.fn() };

    await expect(userIsUnitOccupantOrShareRecipient(knex, 'u1', 't1')).resolves.toBe(false);
  });

  it('treats expired assignment as non-occupant (falls through to share check)', async () => {
    const assignmentFirst = jest.fn().mockResolvedValue(null);
    const sharingFirst = jest.fn().mockResolvedValue(null);
    const assignmentChain = chainWithWhereAndFirst(assignmentFirst);
    const sharingChain = chainWithWhereAndFirst(sharingFirst);

    const knex = jest.fn((table: string) => {
      if (table === 'unit_assignments') return assignmentChain;
      if (table === 'key_sharing') return sharingChain;
      throw new Error(`unexpected ${table}`);
    }) as unknown as import('knex').Knex;
    (knex as unknown as { fn: { now: jest.Mock } }).fn = { now: jest.fn() };

    await expect(userIsUnitOccupantOrShareRecipient(knex, 'u1', 't1')).resolves.toBe(false);
    expect(assignmentChain.where).toHaveBeenCalledTimes(2);
  });
});
