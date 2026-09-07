import { Knex } from 'knex';

/**
 * Create activity logs system table
 * 
 * Implements a flexible activity logging system for tracking unit state changes
 * (lock, unlock, etc.) and other important events. Unlike notifications, activity
 * logs do not require read receipts - they are a historical record.
 * 
 * Tables created:
 * - activity_logs: Historical record of unit and device state changes
 */
export async function up(knex: Knex): Promise<void> {
  // Create activity_logs table
  const hasActivityLogsTable = await knex.schema.hasTable('activity_logs');
  if (!hasActivityLogsTable) {
    await knex.schema.createTable('activity_logs', (table) => {
      table.string('id', 36).primary();
      
      // The entity this activity is about
      table.enum('entity_type', [
        'unit',
        'device',
        'facility',
        'user',
        'gateway'
      ]).notNullable();
      table.string('entity_id', 36).notNullable();
      
      // Activity type for filtering and display
      table.enum('activity_type', [
        'lock',
        'unlock',
        'locking',
        'unlocking',
        'access_attempt',
        'status_change',
        'error',
        'maintenance_start',
        'maintenance_end',
        'assignment_change',
        'configuration_change',
        'connection_change',
        'general'
      ]).notNullable();
      
      // Activity description
      table.string('title', 255).notNullable();
      table.text('description').nullable();
      
      // Actor information (who/what performed the action)
      table.enum('actor_type', ['user', 'system', 'device', 'gateway']).notNullable();
      table.string('actor_id', 36).nullable().comment('User ID if actor_type is user');
      table.string('actor_name', 255).nullable().comment('Display name for the actor');
      
      // Result/outcome of the activity
      table.enum('result', ['success', 'failure', 'pending', 'unknown']).defaultTo('success');
      table.string('result_message', 500).nullable();
      
      // Facility scoping for multi-tenant filtering
      table.string('facility_id', 36).nullable();
      
      // Additional context
      table.string('unit_id', 36).nullable().comment('Unit ID if activity is about a unit');
      table.string('device_id', 36).nullable().comment('Device ID if activity involves a device');
      
      // Metadata for extensibility
      table.json('metadata').nullable();
      
      // IP address for audit trail
      table.string('ip_address', 45).nullable();
      
      // Timestamps
      table.datetime('occurred_at').notNullable().comment('When the activity occurred');
      table.timestamps(true, true);

      // Foreign keys (optional - some entities may be deleted)
      table.foreign('facility_id').references('id').inTable('facilities').onDelete('SET NULL');
      table.foreign('unit_id').references('id').inTable('units').onDelete('SET NULL');

      // Indexes for common queries
      table.index(['entity_type', 'entity_id'], 'idx_activity_logs_entity');
      table.index(['facility_id', 'occurred_at'], 'idx_activity_logs_facility_time');
      table.index(['unit_id', 'occurred_at'], 'idx_activity_logs_unit_time');
      table.index(['device_id', 'occurred_at'], 'idx_activity_logs_device_time');
      table.index(['activity_type'], 'idx_activity_logs_type');
      table.index(['actor_type', 'actor_id'], 'idx_activity_logs_actor');
      table.index(['occurred_at'], 'idx_activity_logs_occurred');
      table.index(['result'], 'idx_activity_logs_result');
    });
    console.log('Created activity_logs table');
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasActivityLogsTable = await knex.schema.hasTable('activity_logs');
  if (hasActivityLogsTable) {
    await knex.schema.dropTableIfExists('activity_logs');
    console.log('Dropped activity_logs table');
  }
}
