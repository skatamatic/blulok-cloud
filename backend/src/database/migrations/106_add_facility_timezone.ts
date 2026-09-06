import type { Knex } from 'knex';

const TABLE = 'facilities';
const COLUMN = 'timezone';
/** British Columbia — Pacific Time with DST. */
const BC_TIMEZONE = 'America/Vancouver';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TABLE, COLUMN))) {
    await knex.schema.alterTable(TABLE, (table) => {
      table
        .string(COLUMN, 64)
        .notNullable()
        .defaultTo(BC_TIMEZONE)
        .comment('IANA timezone for facility-local dates on outbound notifications');
    });
  }

  await knex(TABLE)
    .where((builder) => {
      builder.whereNull(COLUMN).orWhere(COLUMN, '');
    })
    .update({ [COLUMN]: BC_TIMEZONE });
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TABLE, COLUMN)) {
    await knex.schema.alterTable(TABLE, (table) => {
      table.dropColumn(COLUMN);
    });
  }
}
