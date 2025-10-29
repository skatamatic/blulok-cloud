import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('user_otps');
  if (exists) return;

  await knex.schema.createTable('user_otps', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.uuid('user_id').notNullable();
    table.uuid('invite_id').nullable();
    table.string('code_hash', 255).notNullable();
    table.timestamp('expires_at').notNullable();
    table.integer('attempts').notNullable().defaultTo(0);
    table.enum('delivery_method', ['sms', 'email']).notNullable();
    table.timestamp('last_sent_at').notNullable();
    table.timestamps(true, true);

    table.index(['user_id'], 'idx_user_otps_user');
    table.index(['invite_id'], 'idx_user_otps_invite');
    table.index(['expires_at'], 'idx_user_otps_expires');
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
    table.foreign('invite_id').references('user_invites.id').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('user_otps');
  if (!exists) return;
  await knex.schema.dropTable('user_otps');
}


