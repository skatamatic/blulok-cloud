import { Knex } from 'knex';

/**
 * Removal / unassign FMS changes store only before_data (after_data is intentionally null).
 * Original schema incorrectly marked after_data NOT NULL, breaking bulk inserts.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('fms_changes', (table) => {
    table.json('after_data').nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('fms_changes', (table) => {
    table.json('after_data').notNullable().alter();
  });
}
