import { Knex } from 'knex';

/**
 * When true, the Remote Gate widget may send timed OPEN commands with an `open_until`
 * unix timestamp (UTC). Default false — unlock is one-shot with no open_until claim.
 */
export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn('access_control_devices', 'supports_widget_timed_open');
  if (!has) {
    await knex.schema.alterTable('access_control_devices', (t) => {
      t.boolean('supports_widget_timed_open').notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn('access_control_devices', 'supports_widget_timed_open');
  if (has) {
    await knex.schema.alterTable('access_control_devices', (t) => {
      t.dropColumn('supports_widget_timed_open');
    });
  }
}
