import { Knex } from 'knex';

/**
 * Tracks FMS tenants who were not invited at creation time because of
 * invitePolicy=none or invitePolicy=device_equipped (awaiting BluLok).
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('deferred_user_invites');
  if (exists) return;

  await knex.schema.createTable('deferred_user_invites', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.uuid('user_id').notNullable().unique();
    table.uuid('facility_id').notNullable();
    table
      .enu('reason', ['policy_none', 'awaiting_blulok_device'], {
        useNative: false,
        enumName: 'deferred_invite_reason',
      })
      .notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('resolved_at').nullable();
    table.string('resolved_reason', 64).nullable();

    table.index(['facility_id'], 'idx_deferred_invites_facility');
    table.index(['reason', 'resolved_at'], 'idx_deferred_invites_pending');
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
    table.foreign('facility_id').references('facilities.id').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('deferred_user_invites');
  if (!exists) return;
  await knex.schema.dropTable('deferred_user_invites');
}
