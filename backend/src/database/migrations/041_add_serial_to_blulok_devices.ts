/**
 * Migration: Add serial column to blulok_devices
 * 
 * Adds a nullable 'serial' column to the blulok_devices table to support
 * gateway-provided serial numbers in device state updates. This field is
 * separate from device_serial and allows gateways to provide their own
 * serial identifier format.
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Check if column already exists
  const hasSerialColumn = await knex.schema.hasColumn('blulok_devices', 'serial');
  
  if (!hasSerialColumn) {
    await knex.schema.alterTable('blulok_devices', (table) => {
      table.string('serial', 100).nullable().after('device_serial');
      table.index(['serial'], 'idx_blulok_devices_serial');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasSerialColumn = await knex.schema.hasColumn('blulok_devices', 'serial');
  
  if (hasSerialColumn) {
    await knex.schema.alterTable('blulok_devices', (table) => {
      table.dropIndex([], 'idx_blulok_devices_serial');
      table.dropColumn('serial');
    });
  }
}
