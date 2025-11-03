import { Knex } from 'knex';

/**
 * Migration: Make unit_id nullable in blulok_devices table
 * 
 * This allows devices to be created from gateway sync without requiring
 * a unit association. Technicians can assign devices to units later
 * through the cloud interface.
 */
export async function up(knex: Knex): Promise<void> {
  // Check if table exists before modifying
  const hasTable = await knex.schema.hasTable('blulok_devices');
  if (!hasTable) {
    console.log('blulok_devices table does not exist, skipping migration');
    return;
  }

  // Check if column already allows null
  const columnInfo = await knex.raw(`
    SELECT IS_NULLABLE 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'blulok_devices'
    AND COLUMN_NAME = 'unit_id'
  `);

  const isNullable = Array.isArray(columnInfo) && columnInfo[0]?.[0]?.IS_NULLABLE;
  
  if (isNullable === 'NO') {
    // Find the foreign key constraint name
    const fkInfo = await knex.raw(`
      SELECT CONSTRAINT_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'blulok_devices'
      AND COLUMN_NAME = 'unit_id'
      AND REFERENCED_TABLE_NAME IS NOT NULL
    `);

    const fkName = (fkInfo as any)[0]?.[0]?.CONSTRAINT_NAME;

    // Drop the foreign key constraint if it exists
    if (fkName) {
      await knex.raw(`ALTER TABLE blulok_devices DROP FOREIGN KEY ??`, [fkName]);
    }

    // Get the actual column type to preserve it
    const typeInfo = await knex.raw(`
      SELECT COLUMN_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'blulok_devices'
      AND COLUMN_NAME = 'unit_id'
    `);
    
    const columnType = Array.isArray(typeInfo) && typeInfo[0]?.[0]?.COLUMN_TYPE || 'CHAR(36)';
    
    // Modify the column to allow null
    // Note: MySQL allows multiple NULLs in unique columns, so we don't need to drop the unique constraint
    await knex.raw(`
      ALTER TABLE blulok_devices
      MODIFY COLUMN unit_id ${columnType} NULL
    `);

    // Recreate foreign key with ON DELETE SET NULL for orphaned units
    await knex.raw(`
      ALTER TABLE blulok_devices
      ADD CONSTRAINT blulok_devices_unit_id_foreign
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL
    `);
  } else {
    console.log('unit_id column already allows NULL');
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('blulok_devices');
  if (!hasTable) {
    return;
  }

  // First, ensure all devices have a unit_id before making it NOT NULL
  const nullUnitDevices = await knex('blulok_devices')
    .whereNull('unit_id')
    .count('* as count')
    .first();

  const nullCount = nullUnitDevices ? parseInt(nullUnitDevices.count as string) : 0;
  
  if (nullCount > 0) {
    console.warn(`Warning: ${nullCount} devices have null unit_id. Cannot make column NOT NULL.`);
    console.warn('Please assign these devices to units before rolling back this migration.');
    throw new Error(`Cannot rollback: ${nullCount} devices have null unit_id`);
  }

  // Find and drop the foreign key constraint
  const fkInfo = await knex.raw(`
    SELECT CONSTRAINT_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'blulok_devices'
    AND COLUMN_NAME = 'unit_id'
    AND REFERENCED_TABLE_NAME IS NOT NULL
  `);

  const fkName = (fkInfo as any)[0]?.[0]?.CONSTRAINT_NAME;

  if (fkName) {
    await knex.raw(`ALTER TABLE blulok_devices DROP FOREIGN KEY ??`, [fkName]);
  }

    // Get the actual column type to preserve it
    const typeInfo = await knex.raw(`
      SELECT COLUMN_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'blulok_devices'
      AND COLUMN_NAME = 'unit_id'
    `);
    
    const columnType = Array.isArray(typeInfo) && typeInfo[0]?.[0]?.COLUMN_TYPE || 'CHAR(36)';
    
    // Modify column back to NOT NULL
    await knex.raw(`
      ALTER TABLE blulok_devices
      MODIFY COLUMN unit_id ${columnType} NOT NULL
    `);

  // Recreate foreign key with ON DELETE CASCADE
  await knex.raw(`
    ALTER TABLE blulok_devices
    ADD CONSTRAINT blulok_devices_unit_id_foreign
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
  `);
}

