import { Knex } from 'knex';

/**
 * Access points without open/closed sensors use cloud-owned state after OPEN:
 * zero seconds stays logically locked; a positive timeout is logically open until
 * no_feedback_unlock_until, then returns to locked.
 */
export async function up(knex: Knex): Promise<void> {
  const hasFeedback = await knex.schema.hasColumn('access_control_devices', 'has_lock_feedback');
  const hasTimeout = await knex.schema.hasColumn(
    'access_control_devices',
    'no_feedback_open_timeout_sec',
  );
  const hasUnlockUntil = await knex.schema.hasColumn(
    'access_control_devices',
    'no_feedback_unlock_until',
  );

  await knex.schema.alterTable('access_control_devices', (table) => {
    if (!hasFeedback) {
      table.boolean('has_lock_feedback').notNullable().defaultTo(true);
    }
    if (!hasTimeout) {
      table.integer('no_feedback_open_timeout_sec').notNullable().defaultTo(0);
    }
    if (!hasUnlockUntil) {
      table.timestamp('no_feedback_unlock_until').nullable();
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasFeedback = await knex.schema.hasColumn('access_control_devices', 'has_lock_feedback');
  const hasTimeout = await knex.schema.hasColumn(
    'access_control_devices',
    'no_feedback_open_timeout_sec',
  );
  const hasUnlockUntil = await knex.schema.hasColumn(
    'access_control_devices',
    'no_feedback_unlock_until',
  );

  await knex.schema.alterTable('access_control_devices', (table) => {
    if (hasUnlockUntil) table.dropColumn('no_feedback_unlock_until');
    if (hasTimeout) table.dropColumn('no_feedback_open_timeout_sec');
    if (hasFeedback) table.dropColumn('has_lock_feedback');
  });
}
