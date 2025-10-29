import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('user_invites');
  if (exists) return;

  await knex.schema.createTable('user_invites', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.uuid('user_id').notNullable();
    table.string('token_hash', 255).notNullable();
    table.timestamp('expires_at').notNullable();
    table.timestamp('last_sent_at').notNullable();
    table.timestamp('consumed_at').nullable();
    table.json('metadata').nullable();
    table.timestamps(true, true);

    table.index(['user_id'], 'idx_user_invites_user');
    table.index(['expires_at'], 'idx_user_invites_expires');
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('user_invites');
  if (!exists) return;
  await knex.schema.dropTable('user_invites');
}


