import type { Knex } from 'knex';

const TABLE = 'facilities';
const COLUMN = 'lock_command_timeout_sec';

/** Align DB column default with DEFAULT_LOCK_COMMAND_TIMEOUT_SEC (5 minutes). */
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TABLE, COLUMN);
  if (hasColumn) {
    await knex.schema.alterTable(TABLE, (table) => {
      table.integer(COLUMN).unsigned().notNullable().defaultTo(300).alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TABLE, COLUMN);
  if (hasColumn) {
    await knex.schema.alterTable(TABLE, (table) => {
      table.integer(COLUMN).unsigned().notNullable().defaultTo(10).alter();
    });
  }
}
