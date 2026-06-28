import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('fms_webhook_events')) {
    return;
  }

  await knex.schema.createTable('fms_webhook_events', (table) => {
    table.uuid('id').primary();
    table.uuid('facility_id').notNullable();
    table.string('external_event_id', 255).notNullable();
    table.string('event_type', 128).notNullable();
    table.timestamp('received_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('processed_at').nullable();
    table.uuid('sync_log_id').nullable();

    table.foreign('facility_id').references('id').inTable('facilities').onDelete('CASCADE');
    table.foreign('sync_log_id').references('id').inTable('fms_sync_logs').onDelete('SET NULL');

    table.unique(['facility_id', 'external_event_id']);
    table.index(['facility_id', 'received_at']);
    table.index('event_type');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('fms_webhook_events');
}
