import bcrypt from 'bcrypt';
import { Knex } from 'knex';
import {
  DEV_ROLE_TEST_ACCOUNTS,
  DEV_STUB_FACILITY_ID,
} from '@/constants/dev-test-accounts.constants';
import { DatabaseService } from '@/services/database.service';
import { logger } from '@/utils/logger';

/**
 * Ensures fixed dev-only role test accounts exist and are linked to the first facility.
 * Idempotent — safe to run on every development startup.
 */
export class DevTestAccountsService {
  public static async ensureRoleTestAccounts(): Promise<void> {
    const db = DatabaseService.getInstance().connection;
    const facility = await this.resolveTargetFacility(db);

    if (!facility) {
      logger.warn('Dev role test accounts skipped: no facility available and stub could not be created');
      return;
    }

    const passwordHash = await bcrypt.hash(DEV_ROLE_TEST_ACCOUNTS[0].password, 12);

    for (const account of DEV_ROLE_TEST_ACCOUNTS) {
      const userId = await this.ensureUser(db, account, passwordHash);
      await this.ensureFacilityAssociation(db, userId, facility.id);
    }

    logger.info('Dev role test accounts ensured', {
      facilityId: facility.id,
      facilityName: facility.name,
      accounts: DEV_ROLE_TEST_ACCOUNTS.map((a) => a.email),
    });
  }

  private static async resolveTargetFacility(
    db: Knex
  ): Promise<{ id: string; name: string } | undefined> {
    const existing = await db('facilities')
      .select('id', 'name')
      .orderBy('created_at', 'asc')
      .first();

    if (existing) {
      return existing;
    }

    const hasFacilitiesTable = await db.schema.hasTable('facilities');
    if (!hasFacilitiesTable) {
      return undefined;
    }

    const stub = {
      id: DEV_STUB_FACILITY_ID,
      name: 'Dev Test Facility',
      description: 'Auto-created for dev role test accounts',
      address: '1 Dev Test Lane',
      status: 'active' as const,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    };

    await db('facilities').insert(stub);
    return { id: stub.id, name: stub.name };
  }

  private static async ensureUser(
    db: Knex,
    account: (typeof DEV_ROLE_TEST_ACCOUNTS)[number],
    passwordHash: string
  ): Promise<string> {
    const existing = await db('users').where('email', account.email).first();

    if (!existing) {
      await db('users').insert({
        id: account.id,
        email: account.email,
        login_identifier: account.loginIdentifier,
        password_hash: passwordHash,
        first_name: account.firstName,
        last_name: account.lastName,
        role: account.role,
        is_active: true,
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
      });
      return account.id;
    }

    await db('users')
      .where('id', existing.id)
      .update({
        login_identifier: account.loginIdentifier,
        first_name: account.firstName,
        last_name: account.lastName,
        role: account.role,
        is_active: true,
        updated_at: db.fn.now(),
      });

    return existing.id as string;
  }

  private static async ensureFacilityAssociation(
    db: Knex,
    userId: string,
    facilityId: string
  ): Promise<void> {
    const hasTable = await db.schema.hasTable('user_facility_associations');
    if (!hasTable) {
      return;
    }

    const existing = await db('user_facility_associations')
      .where({ user_id: userId, facility_id: facilityId })
      .first();

    if (existing) {
      return;
    }

    await db('user_facility_associations').insert({
      user_id: userId,
      facility_id: facilityId,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });
  }
}
