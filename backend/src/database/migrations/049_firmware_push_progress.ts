import { Knex } from 'knex';

/**
 * Add firmware push progress tracking:
 *
 * 1. New table `firmware_push_events` — append-only event log for progress reports,
 *    device status changes, and error events from the gateway during OTA operations.
 *
 * 2. Extend `firmware_pushes` with aggregate progress columns for fast reads
 *    (materialized view of events — avoids scanning the events table).
 */
export async function up(knex: Knex): Promise<void> {
  // Extend firmware_pushes with aggregate progress columns
  await knex.schema.alterTable('firmware_pushes', (table) => {
    table.tinyint('progress_percent').unsigned().defaultTo(0).after('chunks_sent');
    table.string('phase', 50).nullable().after('progress_percent');
    table.integer('devices_total').unsigned().nullable().after('phase');
    table.integer('devices_complete').unsigned().defaultTo(0).after('devices_total');
    table.integer('devices_failed').unsigned().defaultTo(0).after('devices_complete');
  });

  // Create firmware_push_events table
  const hasTable = await knex.schema.hasTable('firmware_push_events');
  if (!hasTable) {
    await knex.schema.createTable('firmware_push_events', (table) => {
      table.string('id', 36).primary();
      table.string('push_id', 36).notNullable();
      table.enum('event_type', ['progress', 'device_status', 'error', 'info']).notNullable();

      // Progress fields
      table.tinyint('progress_percent').unsigned().nullable();
      table.string('phase', 50).nullable();

      // Device fields
      table.string('device_id', 255).nullable();
      table.string('device_status', 50).nullable();

      // Error fields
      table.string('error_code', 100).nullable();
      table.text('error_message').nullable();
      table.enum('error_severity', ['warning', 'critical']).nullable();

      // General
      table.text('message').nullable();
      table.json('metadata').nullable();

      table.datetime('reported_at').notNullable();
      table.datetime('created_at').notNullable().defaultTo(knex.fn.now());

      table.foreign('push_id').references('id').inTable('firmware_pushes').onDelete('CASCADE');
      table.index(['push_id', 'created_at'], 'idx_push_events_push_created');
      table.index(['push_id', 'event_type'], 'idx_push_events_push_type');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('firmware_push_events');

  const hasCol = async (col: string) => knex.schema.hasColumn('firmware_pushes', col);
  if (await hasCol('progress_percent')) {
    await knex.schema.alterTable('firmware_pushes', (table) => {
      table.dropColumn('progress_percent');
      table.dropColumn('phase');
      table.dropColumn('devices_total');
      table.dropColumn('devices_complete');
      table.dropColumn('devices_failed');
    });
  }
}
