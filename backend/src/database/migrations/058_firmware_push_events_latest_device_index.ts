import { Knex } from 'knex';

const INDEX_NAME = 'idx_push_events_latest_device';
const TABLE_NAME = 'firmware_push_events';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TABLE_NAME, (table) => {
    table.index(['push_id', 'event_type', 'device_id', 'created_at'], INDEX_NAME);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TABLE_NAME, (table) => {
    table.dropIndex(['push_id', 'event_type', 'device_id', 'created_at'], INDEX_NAME);
  });
}
