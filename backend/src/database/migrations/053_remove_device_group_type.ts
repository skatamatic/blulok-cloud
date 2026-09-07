import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('device_groups');
  if (!hasTable) return;

  try {
    await knex.schema.alterTable('device_groups', (table) => {
      table.dropIndex(['facility_id', 'group_type'], 'idx_device_groups_facility_type');
    });
  } catch {
    // Ignore when index is absent.
  }

  const hasGroupType = await knex.schema.hasColumn('device_groups', 'group_type');
  if (hasGroupType) {
    await knex.schema.alterTable('device_groups', (table) => {
      table.dropColumn('group_type');
    });
  }

  try {
    await knex.schema.alterTable('device_groups', (table) => {
      table.index(['facility_id'], 'idx_device_groups_facility_id');
    });
  } catch {
    // Ignore when index already exists.
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('device_groups');
  if (!hasTable) return;

  const hasGroupType = await knex.schema.hasColumn('device_groups', 'group_type');
  if (!hasGroupType) {
    await knex.schema.alterTable('device_groups', (table) => {
      table.enum('group_type', ['access_zone', 'code_group']).notNullable().defaultTo('access_zone').after('description');
    });
  }

  try {
    await knex.schema.alterTable('device_groups', (table) => {
      table.dropIndex(['facility_id'], 'idx_device_groups_facility_id');
    });
  } catch {
    // Ignore when index is absent.
  }

  try {
    await knex.schema.alterTable('device_groups', (table) => {
      table.index(['facility_id', 'group_type'], 'idx_device_groups_facility_type');
    });
  } catch {
    // Ignore when index already exists.
  }
}
