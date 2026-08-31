import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('gateway_inventory_devices')) {
    return;
  }

  await knex.schema.createTable('gateway_inventory_devices', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.uuid('gateway_id').notNullable().references('id').inTable('gateways').onDelete('CASCADE');
    table.string('device_kind', 64).notNullable();
    table.string('device_serial', 128).notNullable();
    table.string('state', 32).nullable();
    table.string('firmware_version', 64).nullable();
    table.json('info').nullable();
    table.json('metadata').nullable();
    table.dateTime('last_seen').nullable();
    table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
    table.dateTime('updated_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['gateway_id', 'device_kind', 'device_serial'], {
      indexName: 'uq_gateway_inv_dev_kind_serial',
    });
    table.index(['gateway_id', 'device_kind'], 'idx_gateway_inv_dev_gateway_kind');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('gateway_inventory_devices');
}
