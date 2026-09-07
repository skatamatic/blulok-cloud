import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('access_code_push_outbox')) {
    return;
  }

  await knex.schema.createTable('access_code_push_outbox', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.uuid('facility_id').notNullable().index();
    table
      .string('status', 20)
      .notNullable()
      .defaultTo('pending')
      .index();
    table.string('last_nonce', 255).nullable();
    table.integer('attempt_count').notNullable().defaultTo(0);
    table.text('last_error').nullable();
    table.dateTime('next_attempt_at').nullable().index();
    table.boolean('coalesce_pending').notNullable().defaultTo(false);
    table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
    table.dateTime('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index(['status', 'next_attempt_at', 'facility_id'], 'idx_ac_push_outbox_due');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('access_code_push_outbox');
}
