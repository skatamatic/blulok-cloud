import { Knex } from 'knex';

/**
 * Create device_denylist_entries table
 * 
 * Tracks denylist entries per device to maintain state of which users
 * are currently denied access to specific devices. This enables:
 * - Tracking which devices have users in their denylist
 * - Detecting when previously denied users should be removed from denylist
 * - Managing expiration of temporary denylist entries
 * - Audit trail of denylist operations
 */
export async function up(knex: Knex): Promise<void> {
  // Check if table already exists
  const hasTable = await knex.schema.hasTable('device_denylist_entries');
  if (hasTable) {
    console.log('device_denylist_entries table already exists, skipping migration');
    return;
  }

  await knex.schema.createTable('device_denylist_entries', (table) => {
    table.string('id', 36).primary();
    table.string('device_id', 36).notNullable();
    table.string('user_id', 36).notNullable();
    table.timestamp('expires_at').nullable();
    table.string('created_by', 36).nullable();
    table.enum('source', ['user_deactivation', 'unit_unassignment', 'fms_sync', 'key_sharing_revocation']).notNullable();
    table.timestamps(true, true);

    // Foreign keys
    table.foreign('device_id').references('id').inTable('blulok_devices').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');

    // Indexes
    table.index(['device_id'], 'idx_device_denylist_device_id');
    table.index(['user_id'], 'idx_device_denylist_user_id');
    table.index(['expires_at'], 'idx_device_denylist_expires_at');
    
    // Unique constraint: only one active entry per device-user pair
    // Note: MySQL doesn't support partial unique indexes easily, so we'll enforce
    // this in application logic and add a regular unique index that allows multiple
    // entries for historical tracking (we can clean up old expired ones)
    table.unique(['device_id', 'user_id'], 'unique_device_user_denylist');
  });

  console.log('Created device_denylist_entries table');
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('device_denylist_entries');
  if (!hasTable) {
    console.log('device_denylist_entries table does not exist, skipping rollback');
    return;
  }

  await knex.schema.dropTableIfExists('device_denylist_entries');
  console.log('Dropped device_denylist_entries table');
}

