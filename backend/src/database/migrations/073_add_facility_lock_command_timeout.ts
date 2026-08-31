import type { Knex } from 'knex';

const TABLE = 'facilities';
const COLUMN = 'lock_command_timeout_sec';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TABLE, COLUMN);
  if (!hasColumn) {
    await knex.schema.alterTable(TABLE, (table) => {
      table
        .integer(COLUMN)
        .unsigned()
        .notNullable()
        .defaultTo(10)
        .comment('Seconds to wait for gateway lock/unlock confirmation before reverting');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TABLE, COLUMN);
  if (hasColumn) {
    await knex.schema.alterTable(TABLE, (table) => {
      table.dropColumn(COLUMN);
    });
  }
}
