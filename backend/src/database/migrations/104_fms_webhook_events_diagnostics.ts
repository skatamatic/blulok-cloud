import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasStatus = await knex.schema.hasColumn('fms_webhook_events', 'status');
  if (!hasStatus) {
    await knex.schema.alterTable('fms_webhook_events', (table) => {
      table.string('status', 32).notNullable().defaultTo('processed');
      table.text('error_message').nullable();
      table.json('raw_payload').nullable();
    });
  }

  await knex('fms_webhook_events')
    .whereNull('status')
    .orWhere('status', '')
    .update({ status: 'processed' });
}

export async function down(knex: Knex): Promise<void> {
  const hasStatus = await knex.schema.hasColumn('fms_webhook_events', 'status');
  if (!hasStatus) return;

  await knex.schema.alterTable('fms_webhook_events', (table) => {
    table.dropColumn('status');
    table.dropColumn('error_message');
    table.dropColumn('raw_payload');
  });
}
