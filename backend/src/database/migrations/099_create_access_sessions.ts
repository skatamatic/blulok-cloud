import { Knex } from 'knex';

/**
 * Access sessions: one logical access per row (pending → open → closed, or terminal denied/failed/timed_out).
 * activity_logs remains the immutable raw trail; access_session_id links events into a session.
 */
export async function up(knex: Knex): Promise<void> {
  const hasSessions = await knex.schema.hasTable('access_sessions');
  if (!hasSessions) {
    await knex.schema.createTable('access_sessions', (table) => {
      table.string('id', 36).primary();

      table.string('facility_id', 36).nullable();
      table.string('unit_id', 36).nullable();
      table.string('device_id', 36).notNullable();
      table.enum('device_type', ['blulok', 'access_control']).notNullable().defaultTo('blulok');
      table.string('gateway_id', 36).nullable();

      table.enum('kind', ['access', 'lock_only']).notNullable().defaultTo('access');
      table.enum('origin', ['cloud_remote', 'on_site', 'local', 'system']).notNullable();
      table.string('method', 50).notNullable().defaultTo('unknown');
      table.enum('outcome', ['granted', 'denied', 'failed']).nullable();
      table
        .enum('state', ['pending', 'open', 'closed', 'timed_out', 'denied', 'failed'])
        .notNullable()
        .defaultTo('pending');

      table.enum('actor_type', ['user', 'system', 'device', 'gateway']).nullable();
      table.string('actor_id', 36).nullable();
      table.string('actor_name', 255).nullable();
      table.string('actor_role', 50).nullable();

      table.string('denial_reason', 100).nullable();
      table.string('reason_message', 500).nullable();

      table.datetime('started_at').notNullable();
      table.datetime('opened_at').nullable();
      table.datetime('closed_at').nullable();
      table.datetime('expires_at').nullable();
      table.datetime('settled_at').nullable();
      table.integer('open_duration_sec').nullable();

      table.integer('attempt_count').notNullable().defaultTo(1);
      table.string('remote_command_id', 36).nullable();
      table.string('correlation_id', 100).nullable();
      table.json('metadata').nullable();

      table.timestamps(true, true);

      table.foreign('facility_id').references('id').inTable('facilities').onDelete('SET NULL');
      table.foreign('unit_id').references('id').inTable('units').onDelete('SET NULL');

      table.index(['facility_id', 'started_at'], 'idx_access_sessions_facility_time');
      table.index(['unit_id', 'started_at'], 'idx_access_sessions_unit_time');
      table.index(['device_id', 'state'], 'idx_access_sessions_device_state');
      table.index(['state', 'expires_at'], 'idx_access_sessions_state_expires');
      table.index(['actor_id', 'started_at'], 'idx_access_sessions_actor_time');
      table.unique(['remote_command_id'], {
        indexName: 'uq_access_sessions_remote_command_id',
      });
    });
    console.log('Created access_sessions table');
  }

  const hasActivityLogs = await knex.schema.hasTable('activity_logs');
  if (hasActivityLogs) {
    const hasCol = await knex.schema.hasColumn('activity_logs', 'access_session_id');
    if (!hasCol) {
      await knex.schema.alterTable('activity_logs', (table) => {
        table.string('access_session_id', 36).nullable().after('device_id');
        table.index(['access_session_id'], 'idx_activity_logs_access_session');
      });
      console.log('Added activity_logs.access_session_id');
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasActivityLogs = await knex.schema.hasTable('activity_logs');
  if (hasActivityLogs) {
    const hasCol = await knex.schema.hasColumn('activity_logs', 'access_session_id');
    if (hasCol) {
      await knex.schema.alterTable('activity_logs', (table) => {
        table.dropIndex(['access_session_id'], 'idx_activity_logs_access_session');
        table.dropColumn('access_session_id');
      });
    }
  }

  await knex.schema.dropTableIfExists('access_sessions');
}
