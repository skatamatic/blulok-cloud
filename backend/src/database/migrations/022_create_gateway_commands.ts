import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasCommands = await knex.schema.hasTable('gateway_commands');
  if (!hasCommands) {
    await knex.schema.createTable('gateway_commands', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      table.uuid('facility_id').notNullable().index();
      table.uuid('gateway_id').notNullable().index();
      table.uuid('device_id').notNullable().index();
      table.string('command_type', 50).notNullable(); // ADD_KEY, REVOKE_KEY, etc
      table.json('payload').notNullable();
      table.string('idempotency_key', 255).notNullable().unique();
      table.string('status', 20).notNullable().index(); // pending, queued, in_progress, succeeded, failed, cancelled, dead_letter
      table.integer('priority').notNullable().defaultTo(0).index();
      table.integer('attempt_count').notNullable().defaultTo(0);
      table.text('last_error').nullable();
      table.dateTime('next_attempt_at').nullable().index();
      table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
      table.dateTime('updated_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  const hasAttempts = await knex.schema.hasTable('gateway_command_attempts');
  if (!hasAttempts) {
    await knex.schema.createTable('gateway_command_attempts', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      table.uuid('command_id').notNullable().index()
        .references('id').inTable('gateway_commands').onDelete('CASCADE');
      table.integer('attempt_number').notNullable();
      table.dateTime('started_at').notNullable().defaultTo(knex.fn.now());
      table.dateTime('finished_at').nullable();
      table.boolean('success').notNullable().defaultTo(false);
      table.text('error').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasAttempts = await knex.schema.hasTable('gateway_command_attempts');
  if (hasAttempts) {
    await knex.schema.dropTableIfExists('gateway_command_attempts');
  }
  const hasCommands = await knex.schema.hasTable('gateway_commands');
  if (hasCommands) {
    await knex.schema.dropTableIfExists('gateway_commands');
  }
}




