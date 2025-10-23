import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('device_key_distributions');
  if (!hasTable) return;

  // Add key_code (nullable), key_version, and indexes/unique constraints
  const hasKeyCode = await knex.schema.hasColumn('device_key_distributions', 'key_code');
  const hasKeyVersion = await knex.schema.hasColumn('device_key_distributions', 'key_version');

  await knex.schema.alterTable('device_key_distributions', (table) => {
    if (!hasKeyCode) {
      table.integer('key_code').nullable().index();
    }
    if (!hasKeyVersion) {
      table.enum('key_version', ['v1', 'v2']).notNullable().defaultTo('v2').index();
    }
  });

  // Add supporting indexes
  // Composite indexes for common queries
  await knex.schema.alterTable('device_key_distributions', (table) => {
    table.index(['user_device_id', 'status'], 'dkd_user_device_status_idx');
    table.index(['target_id', 'status'], 'dkd_target_status_idx');
  });

  // Add partial-like uniqueness via a functional index imitation
  // Note: Knex does not support partial indexes portably; emulate by creating a unique index across
  // (user_device_id, target_id, status) which is acceptable given limited statuses.
  // This ensures at most one "added" (or any one status) row per device/lock at a time.
  try {
    await knex.schema.alterTable('device_key_distributions', (table) => {
      table.unique(['user_device_id', 'target_id', 'status'], 'dkd_unique_user_target_status');
    });
  } catch (_e) {
    // Ignore if already exists
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('device_key_distributions');
  if (!hasTable) return;

  try {
    await knex.schema.alterTable('device_key_distributions', (table) => {
      table.dropUnique(['user_device_id', 'target_id', 'status'], 'dkd_unique_user_target_status');
      table.dropIndex(['user_device_id', 'status'], 'dkd_user_device_status_idx');
      table.dropIndex(['target_id', 'status'], 'dkd_target_status_idx');
    });
  } catch (_e) {}

  const hasKeyCode = await knex.schema.hasColumn('device_key_distributions', 'key_code');
  const hasKeyVersion = await knex.schema.hasColumn('device_key_distributions', 'key_version');
  await knex.schema.alterTable('device_key_distributions', (table) => {
    if (hasKeyCode) table.dropColumn('key_code');
    if (hasKeyVersion) table.dropColumn('key_version');
  });
}


