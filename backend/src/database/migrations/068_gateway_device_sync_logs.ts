import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('gateway_device_sync_logs');
  if (exists) return;

  await knex.schema.createTable('gateway_device_sync_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.uuid('gateway_id').notNullable().references('id').inTable('gateways').onDelete('CASCADE');
    table.uuid('facility_id').notNullable().references('id').inTable('facilities').onDelete('CASCADE');
    table.enum('sync_kind', ['inventory', 'state']).notNullable().defaultTo('inventory');
    table.string('source', 50).notNullable().defaultTo('gateway_ws');
    table.json('summary').notNullable();
    table.json('entries').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index(['gateway_id', 'created_at'], 'idx_gw_device_sync_logs_gateway_created');
    table.index(['facility_id', 'created_at'], 'idx_gw_device_sync_logs_facility_created');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('gateway_device_sync_logs');
}
