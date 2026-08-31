import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('gateway_telemetry_logs');
  if (exists) return;

  await knex.schema.createTable('gateway_telemetry_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.uuid('gateway_id').notNullable().references('id').inTable('gateways').onDelete('CASCADE');
    table.uuid('facility_id').notNullable().references('id').inTable('facilities').onDelete('CASCADE');
    table.timestamp('logged_at', { useTz: false, precision: 3 }).notNullable();
    table.json('payload').nullable();
    table.string('source', 32).notNullable().defaultTo('gateway_ws');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index(['gateway_id', 'logged_at'], 'idx_gw_telemetry_logs_gateway_logged_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('gateway_telemetry_logs');
}
