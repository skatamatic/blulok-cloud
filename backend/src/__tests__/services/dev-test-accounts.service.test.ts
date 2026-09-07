import bcrypt from 'bcrypt';
import { DevTestAccountsService } from '@/services/dev-test-accounts.service';
import { DatabaseService } from '@/services/database.service';
import {
  DEV_ROLE_TEST_ACCOUNTS,
  DEV_STUB_FACILITY_ID,
} from '@/constants/dev-test-accounts.constants';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

jest.mock('@/services/database.service');

describe('DevTestAccountsService', () => {
  const facilityRow = { id: 'facility-1', name: 'First Facility' };
  let users: Record<string, unknown>[];
  let associations: Record<string, unknown>[];
  let facilities: Record<string, unknown>[];

  const makeDb = () => {
    const fn = { now: () => new Date() };
    const schema = {
      hasTable: jest.fn().mockImplementation(async (table: string) =>
        ['facilities', 'user_facility_associations'].includes(table)
      ),
    };

    const db = Object.assign(
      jest.fn((table: string) => {
        if (table === 'facilities') {
          return {
            select: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(facilities[0] ?? undefined),
            insert: jest.fn().mockImplementation(async (row) => {
              facilities.push(row);
            }),
          };
        }
        if (table === 'users') {
          return {
            where: jest.fn().mockImplementation((_col: string, value: string) => ({
              first: jest.fn().mockResolvedValue(
                users.find((u) => u.email === value || u.id === value)
              ),
              update: jest.fn().mockImplementation(async (patch) => {
                const idx = users.findIndex((u) => u.id === value || u.email === value);
                if (idx >= 0) users[idx] = { ...users[idx], ...patch };
              }),
            })),
            insert: jest.fn().mockImplementation(async (row) => {
              users.push(row);
            }),
          };
        }
        if (table === 'user_facility_associations') {
          return {
            where: jest.fn().mockImplementation((criteria: Record<string, string>) => ({
              first: jest.fn().mockResolvedValue(
                associations.find(
                  (a) =>
                    a.user_id === criteria.user_id &&
                    a.facility_id === criteria.facility_id
                )
              ),
            })),
            insert: jest.fn().mockImplementation(async (row) => {
              associations.push(row);
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
      { fn, schema }
    );

    return db;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    users = [];
    associations = [];
    facilities = [facilityRow];
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({
      connection: makeDb(),
    });
  });

  it('creates missing role test users and facility associations', async () => {
    await DevTestAccountsService.ensureRoleTestAccounts();

    expect(users).toHaveLength(DEV_ROLE_TEST_ACCOUNTS.length);
    expect(associations).toHaveLength(DEV_ROLE_TEST_ACCOUNTS.length);
    expect(bcrypt.hash).toHaveBeenCalled();
    expect(users.map((u) => u.email)).toEqual(
      expect.arrayContaining(DEV_ROLE_TEST_ACCOUNTS.map((a) => a.email))
    );
  });

  it('creates a stub facility when none exist', async () => {
    facilities = [];
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({
      connection: makeDb(),
    });

    await DevTestAccountsService.ensureRoleTestAccounts();

    expect(facilities).toHaveLength(1);
    expect(facilities[0]?.id).toBe(DEV_STUB_FACILITY_ID);
    expect(users).toHaveLength(DEV_ROLE_TEST_ACCOUNTS.length);
  });

  it('is idempotent when users and associations already exist', async () => {
    for (const account of DEV_ROLE_TEST_ACCOUNTS) {
      users.push({
        id: account.id,
        email: account.email,
        role: account.role,
      });
      associations.push({
        user_id: account.id,
        facility_id: facilityRow.id,
      });
    }

    await DevTestAccountsService.ensureRoleTestAccounts();

    expect(users).toHaveLength(DEV_ROLE_TEST_ACCOUNTS.length);
    expect(associations).toHaveLength(DEV_ROLE_TEST_ACCOUNTS.length);
  });
});
