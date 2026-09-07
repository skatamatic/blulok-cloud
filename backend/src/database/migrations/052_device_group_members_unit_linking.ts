import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasMemberTable = await knex.schema.hasTable('device_group_members');
  if (!hasMemberTable) return;

  const hasSourceUnitId = await knex.schema.hasColumn('device_group_members', 'source_unit_id');
  if (!hasSourceUnitId) {
    await knex.schema.alterTable('device_group_members', (table) => {
      table.uuid('source_unit_id').nullable().after('device_type');
      table.index(['source_unit_id'], 'idx_device_group_members_source_unit_id');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasMemberTable = await knex.schema.hasTable('device_group_members');
  if (!hasMemberTable) return;

  const hasSourceUnitId = await knex.schema.hasColumn('device_group_members', 'source_unit_id');
  if (hasSourceUnitId) {
    await knex.schema.alterTable('device_group_members', (table) => {
      table.dropIndex(['source_unit_id'], 'idx_device_group_members_source_unit_id');
      table.dropColumn('source_unit_id');
    });
  }
}
