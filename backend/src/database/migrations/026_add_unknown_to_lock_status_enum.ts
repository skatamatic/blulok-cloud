import { Knex } from 'knex';

/**
 * Add 'unknown' status to lock_status enum
 * 
 * This allows devices to explicitly show when their lock status is unknown
 * rather than defaulting to 'locked', providing better visibility into
 * connectivity or data issues.
 */
export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('blulok_devices');
  if (!hasTable) {
    console.log('blulok_devices table does not exist, skipping migration');
    return;
  }

  // Check current enum values
  const enumInfo = await knex.raw(`
    SELECT COLUMN_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'blulok_devices'
    AND COLUMN_NAME = 'lock_status'
  `);

  const columnType = Array.isArray(enumInfo) && enumInfo[0]?.[0]?.COLUMN_TYPE;
  
  if (columnType && typeof columnType === 'string') {
    // Check if 'unknown' already exists
    if (columnType.includes("'unknown'")) {
      console.log("'unknown' already exists in lock_status enum, skipping");
      return;
    }

    // For MySQL, we need to modify the column type to add the new enum value
    // This will add 'unknown' to the existing enum
    await knex.raw(`
      ALTER TABLE blulok_devices
      MODIFY COLUMN lock_status ENUM('locked', 'unlocked', 'error', 'maintenance', 'unknown')
    `);

    console.log("Added 'unknown' to lock_status enum");
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('blulok_devices');
  if (!hasTable) {
    console.log('blulok_devices table does not exist, skipping rollback');
    return;
  }

  // Before removing 'unknown', we need to update any devices with 'unknown' status
  // We'll set them to 'error' as a fallback
  await knex('blulok_devices')
    .where('lock_status', 'unknown')
    .update({ lock_status: 'error' });

  // Remove 'unknown' from enum
  await knex.raw(`
    ALTER TABLE blulok_devices
    MODIFY COLUMN lock_status ENUM('locked', 'unlocked', 'error', 'maintenance')
  `);

  console.log("Removed 'unknown' from lock_status enum");
}




