import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('system_settings');
  if (!hasTable) {
    await knex.schema.createTable('system_settings', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      table.string('key', 255).notNullable().unique();
      table.text('value').notNullable();
      table.timestamps(true, true);
      table.index(['key']);
    });
  }

  // Seed default max devices per user = 2 if not present
  const existing = await knex('system_settings').where({ key: 'security.max_devices_per_user' }).first();
  if (!existing) {
    await knex('system_settings').insert({
      id: knex.raw('(UUID())'),
      key: 'security.max_devices_per_user',
      value: '2',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('system_settings');
}


