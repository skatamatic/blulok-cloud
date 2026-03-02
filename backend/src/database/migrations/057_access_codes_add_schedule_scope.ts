import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('access_codes');
  if (!hasTable) return;

  const hasScheduleId = await knex.schema.hasColumn('access_codes', 'schedule_id');
  if (!hasScheduleId) {
    await knex.schema.alterTable('access_codes', (table) => {
      table.uuid('schedule_id').nullable().after('scope_id');
      table.foreign('schedule_id').references('id').inTable('schedules').onDelete('SET NULL');
    });
  }

  try {
    await knex.schema.alterTable('access_codes', (table) => {
      table.index(
        ['facility_id', 'scope_type', 'scope_id', 'schedule_id', 'is_active', 'valid_until'],
        'idx_access_codes_scope_schedule_active_valid',
      );
    });
  } catch {
    // Ignore when index already exists.
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('access_codes');
  if (!hasTable) return;

  try {
    await knex.schema.alterTable('access_codes', (table) => {
      table.dropIndex(
        ['facility_id', 'scope_type', 'scope_id', 'schedule_id', 'is_active', 'valid_until'],
        'idx_access_codes_scope_schedule_active_valid',
      );
    });
  } catch {
    // Ignore when index is absent.
  }

  const hasScheduleId = await knex.schema.hasColumn('access_codes', 'schedule_id');
  if (!hasScheduleId) return;

  try {
    await knex.schema.alterTable('access_codes', (table) => {
      table.dropForeign(['schedule_id']);
    });
  } catch {
    // Ignore when foreign key is absent.
  }

  await knex.schema.alterTable('access_codes', (table) => {
    table.dropColumn('schedule_id');
  });
}
