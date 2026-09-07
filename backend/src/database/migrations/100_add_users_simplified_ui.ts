import { Knex } from 'knex';

/**
 * Presentation-only preference for facility admins (simplified Cloud UI).
 * Not an authorization boundary — APIs remain facility_admin scoped.
 */
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('users', 'simplified_ui');
  if (!hasColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.boolean('simplified_ui').notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('users', 'simplified_ui');
  if (hasColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('simplified_ui');
    });
  }
}
