import { Knex } from 'knex';

/**
 * Future-ready flag: when false (default for all existing devices), the cloud must not
 * issue remote CLOSE/lock commands—only unlock/open. Manual re-lock is required on-site.
 */
export async function up(knex: Knex): Promise<void> {
  const addCol = async (table: string) => {
    const has = await knex.schema.hasColumn(table, 'supports_remote_lock');
    if (!has) {
      await knex.schema.alterTable(table, (t) => {
        t.boolean('supports_remote_lock').notNullable().defaultTo(false);
      });
    }
  };
  await addCol('blulok_devices');
  await addCol('access_control_devices');
}

export async function down(knex: Knex): Promise<void> {
  const dropCol = async (table: string) => {
    const has = await knex.schema.hasColumn(table, 'supports_remote_lock');
    if (has) {
      await knex.schema.alterTable(table, (t) => {
        t.dropColumn('supports_remote_lock');
      });
    }
  };
  await dropCol('blulok_devices');
  await dropCol('access_control_devices');
}
