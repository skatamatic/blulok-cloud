import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Drop if exists from previous failed migration attempt
  await knex.schema.dropTableIfExists('password_reset_tokens');
  
  await knex.schema.createTable('password_reset_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.uuid('user_id').notNullable().index();
    table.string('token', 128).notNullable().unique();
    table.timestamp('expires_at').notNullable();
    table.timestamp('used_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    table.index(['token']);
    table.index(['expires_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('password_reset_tokens');
}

