import type { Knex } from 'knex';

/**
 * Add 'locking' and 'unlocking' transitional states to lock_status enum.
 *
 * These states are used while a lock/unlock command is in flight from the cloud
 * to the gateway. Device sync remains the source of truth for the final
 * locked/unlocked state; these values are only used between command issuance
 * and the next device sync (or timeout).
 */
export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('blulok_devices');
  if (!hasTable) {
    console.log('blulok_devices table does not exist, skipping migration');
    return;
  }

  // Check current enum definition
  const enumInfo = await knex.raw(`
    SELECT COLUMN_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'blulok_devices'
      AND COLUMN_NAME = 'lock_status'
  `);

  const columnType = Array.isArray(enumInfo) && enumInfo[0]?.[0]?.COLUMN_TYPE;

  if (columnType && typeof columnType === 'string') {
    const hasLocking = columnType.includes("'locking'");
    const hasUnlocking = columnType.includes("'unlocking'");

    if (hasLocking && hasUnlocking) {
      console.log("'locking' and 'unlocking' already exist in lock_status enum, skipping");
      return;
    }

    // Define the desired enum order explicitly to avoid drift
    await knex.raw(`
      ALTER TABLE blulok_devices
      MODIFY COLUMN lock_status ENUM('locked', 'unlocked', 'locking', 'unlocking', 'error', 'maintenance', 'unknown')
    `);

    console.log("Added 'locking' and 'unlocking' to lock_status enum");
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('blulok_devices');
  if (!hasTable) {
    console.log('blulok_devices table does not exist, skipping rollback');
    return;
  }

  // Any devices currently in a transitional state should be made explicit again.
  // We conservatively revert them to 'error' so operators can see something went wrong.
  await knex('blulok_devices')
    .whereIn('lock_status', ['locking', 'unlocking'])
    .update({ lock_status: 'error' });

  await knex.raw(`
    ALTER TABLE blulok_devices
    MODIFY COLUMN lock_status ENUM('locked', 'unlocked', 'error', 'maintenance', 'unknown')
  `);

  console.log("Removed 'locking' and 'unlocking' from lock_status enum");
}




