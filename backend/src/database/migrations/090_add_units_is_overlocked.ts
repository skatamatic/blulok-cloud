import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('units', 'is_overlocked');
  if (!hasColumn) {
    await knex.schema.alterTable('units', (table) => {
      table.boolean('is_overlocked').notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('units', 'is_overlocked');
  if (hasColumn) {
    await knex.schema.alterTable('units', (table) => {
      table.dropColumn('is_overlocked');
    });
  }
}
