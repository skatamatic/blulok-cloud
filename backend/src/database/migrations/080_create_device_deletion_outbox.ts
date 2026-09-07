import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('device_deletion_outbox')) {
    return;
  }

  await knex.schema.createTable('device_deletion_outbox', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.uuid('facility_id').notNullable().index();
    table.uuid('gateway_id').notNullable();
    table.string('device_kind', 32).notNullable();
    table.string('lock_id', 255).nullable();
    table.string('access_id', 255).nullable();
    table.integer('relay_channel').nullable();
    table
      .string('status', 20)
      .notNullable()
      .defaultTo('pending')
      .index();
    table.string('last_nonce', 255).nullable();
    table.integer('attempt_count').notNullable().defaultTo(0);
    table.text('last_error').nullable();
    table.dateTime('next_attempt_at').nullable().index();
    table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
    table.dateTime('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index(['facility_id', 'status', 'next_attempt_at'], 'idx_device_del_outbox_facility_due');
    table.index(['facility_id', 'device_kind', 'lock_id'], 'idx_device_del_outbox_blulok');
    table.index(['facility_id', 'device_kind', 'access_id', 'relay_channel'], 'idx_device_del_outbox_ac');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('device_deletion_outbox');
}
