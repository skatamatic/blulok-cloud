import { Knex } from 'knex';

/**
 * Migration: Add telemetry columns to blulok_devices table
 * 
 * Adds columns for enhanced device state tracking:
 * - signal_strength: Wireless signal strength (dBm)
 * - temperature: Device temperature reading
 * - error_code: Error code for error states
 * - error_message: Human-readable error description
 * 
 * These columns support the new partial state update API for gateways.
 */
export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('blulok_devices');
  if (!hasTable) {
    console.log('blulok_devices table does not exist, skipping migration');
    return;
  }

  // Check which columns already exist
  const columns = await knex.raw(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'blulok_devices'
  `);
  
  const existingColumns = new Set(
    (Array.isArray(columns) && columns[0] ? columns[0] : []).map((c: any) => c.COLUMN_NAME)
  );

  // Add signal_strength column if not exists
  if (!existingColumns.has('signal_strength')) {
    await knex.schema.alterTable('blulok_devices', (table) => {
      table.integer('signal_strength').nullable().comment('Wireless signal strength in dBm');
    });
    console.log('Added signal_strength column to blulok_devices');
  }

  // Add temperature column if not exists
  if (!existingColumns.has('temperature')) {
    await knex.schema.alterTable('blulok_devices', (table) => {
      table.decimal('temperature', 5, 2).nullable().comment('Device temperature reading');
    });
    console.log('Added temperature column to blulok_devices');
  }

  // Add error_code column if not exists
  if (!existingColumns.has('error_code')) {
    await knex.schema.alterTable('blulok_devices', (table) => {
      table.string('error_code', 50).nullable().comment('Error code for error states');
    });
    console.log('Added error_code column to blulok_devices');
  }

  // Add error_message column if not exists
  if (!existingColumns.has('error_message')) {
    await knex.schema.alterTable('blulok_devices', (table) => {
      table.string('error_message', 255).nullable().comment('Human-readable error description');
    });
    console.log('Added error_message column to blulok_devices');
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('blulok_devices');
  if (!hasTable) {
    console.log('blulok_devices table does not exist, skipping rollback');
    return;
  }

  // Drop columns in reverse order
  await knex.schema.alterTable('blulok_devices', (table) => {
    table.dropColumn('error_message');
  });
  console.log('Dropped error_message column from blulok_devices');

  await knex.schema.alterTable('blulok_devices', (table) => {
    table.dropColumn('error_code');
  });
  console.log('Dropped error_code column from blulok_devices');

  await knex.schema.alterTable('blulok_devices', (table) => {
    table.dropColumn('temperature');
  });
  console.log('Dropped temperature column from blulok_devices');

  await knex.schema.alterTable('blulok_devices', (table) => {
    table.dropColumn('signal_strength');
  });
  console.log('Dropped signal_strength column from blulok_devices');
}

