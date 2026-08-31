import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('device_groups');
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn('device_groups', 'is_global_shared');
  if (!hasColumn) {
    await knex.schema.alterTable('device_groups', (table) => {
      table.boolean('is_global_shared').notNullable().defaultTo(false).after('group_type');
    });
  }

  try {
    await knex.schema.alterTable('device_groups', (table) => {
      table.index(
        ['facility_id', 'group_type', 'is_global_shared', 'is_active'],
        'idx_device_groups_facility_type_global_active',
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
        ['facility_id', 'group_type', 'is_global_shared', 'is_active'],
        'idx_device_groups_facility_type_global_active',
      );
    });
  } catch {
    // Ignore when index is absent.
  }

  const hasColumn = await knex.schema.hasColumn('device_groups', 'is_global_shared');
  if (hasColumn) {
    await knex.schema.alterTable('device_groups', (table) => {
      table.dropColumn('is_global_shared');
    });
  }
}
