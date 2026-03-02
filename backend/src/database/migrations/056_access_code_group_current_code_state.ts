import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('device_groups');
  if (!hasTable) return;

  const hasCurrentCode = await knex.schema.hasColumn('device_groups', 'access_code_current_code');
  const hasValidFrom = await knex.schema.hasColumn('device_groups', 'access_code_current_valid_from');
  const hasValidUntil = await knex.schema.hasColumn('device_groups', 'access_code_current_valid_until');

  if (!hasCurrentCode || !hasValidFrom || !hasValidUntil) {
    await knex.schema.alterTable('device_groups', (table) => {
      if (!hasCurrentCode) {
        table.string('access_code_current_code', 8).nullable().after('is_global_shared');
      }
      if (!hasValidFrom) {
        table.dateTime('access_code_current_valid_from').nullable().after('access_code_current_code');
      }
      if (!hasValidUntil) {
        table.dateTime('access_code_current_valid_until').nullable().after('access_code_current_valid_from');
      }
    });
  }

  try {
    await knex.schema.alterTable('device_groups', (table) => {
      table.index(
        ['facility_id', 'group_type', 'is_active', 'access_code_current_valid_until'],
        'idx_device_groups_access_code_current_state',
      );
    });
  } catch {
    // Ignore when index already exists.
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('device_groups');
  if (!hasTable) return;

  try {
    await knex.schema.alterTable('device_groups', (table) => {
      table.dropIndex(
        ['facility_id', 'group_type', 'is_active', 'access_code_current_valid_until'],
        'idx_device_groups_access_code_current_state',
      );
    });
  } catch {
    // Ignore when index is absent.
  }

  const hasCurrentCode = await knex.schema.hasColumn('device_groups', 'access_code_current_code');
  const hasValidFrom = await knex.schema.hasColumn('device_groups', 'access_code_current_valid_from');
  const hasValidUntil = await knex.schema.hasColumn('device_groups', 'access_code_current_valid_until');

  if (hasCurrentCode || hasValidFrom || hasValidUntil) {
    await knex.schema.alterTable('device_groups', (table) => {
      if (hasValidUntil) table.dropColumn('access_code_current_valid_until');
      if (hasValidFrom) table.dropColumn('access_code_current_valid_from');
      if (hasCurrentCode) table.dropColumn('access_code_current_code');
    });
  }
}
