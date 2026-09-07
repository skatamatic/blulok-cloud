import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasDeviceGroupsTable = await knex.schema.hasTable('device_groups');
  if (!hasDeviceGroupsTable) return;

  const hasGroupType = await knex.schema.hasColumn('device_groups', 'group_type');
  if (!hasGroupType) {
    await knex.schema.alterTable('device_groups', (table) => {
      table.enum('group_type', ['zone', 'access_code']).notNullable().defaultTo('zone').after('facility_id');
    });
  }

  // Backfill: any group already used as an access-code scope becomes an access_code group.
  const hasAccessCodesTable = await knex.schema.hasTable('access_codes');
  if (hasAccessCodesTable) {
    const rows = await knex('access_codes')
      .distinct('scope_id')
      .where('scope_type', 'device_group')
      .whereNotNull('scope_id');

    const groupIds = rows.map((row) => String(row.scope_id)).filter(Boolean);
    if (groupIds.length > 0) {
      await knex('device_groups')
        .whereIn('id', groupIds)
        .update({ group_type: 'access_code' });
    }
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

export async function down(knex: Knex): Promise<void> {
  const hasDeviceGroupsTable = await knex.schema.hasTable('device_groups');
  if (!hasDeviceGroupsTable) return;

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
