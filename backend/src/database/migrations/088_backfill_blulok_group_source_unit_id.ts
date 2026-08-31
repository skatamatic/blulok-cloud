import { Knex } from 'knex';

/**
 * Backfill source_unit_id on BluLok access-group members so unit-anchored
 * membership survives lock inventory removal and swap.
 */
export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('device_group_members');
  if (!hasTable) return;

  await knex.raw(`
    UPDATE device_group_members AS m
    INNER JOIN blulok_devices AS bd ON bd.id = m.device_id
    SET m.source_unit_id = bd.unit_id
    WHERE m.device_type = 'blulok'
      AND m.source_unit_id IS NULL
      AND bd.unit_id IS NOT NULL
  `);
}

export async function down(_knex: Knex): Promise<void> {
  // Non-destructive data backfill — no down migration.
}
