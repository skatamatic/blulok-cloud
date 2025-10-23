import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // users.key_status
  const hasUsers = await knex.schema.hasTable('users');
  if (hasUsers) {
    const hasKeyStatus = await knex.schema.hasColumn('users', 'key_status');
    if (!hasKeyStatus) {
      await knex.schema.alterTable('users', (table) => {
        table
          .enum('key_status', ['pending_generation', 'ready'])
          .notNullable()
          .defaultTo('pending_generation');
      });
    }
  }

  // user_devices
  const hasUserDevices = await knex.schema.hasTable('user_devices');
  if (!hasUserDevices) {
    await knex.schema.createTable('user_devices', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      table.uuid('user_id').notNullable();
      table.string('app_device_id', 128).notNullable();
      table
        .enum('platform', ['ios', 'android', 'web', 'other'])
        .notNullable()
        .defaultTo('other');
      table.string('device_name', 255).nullable();
      table.text('public_key').nullable(); // base64 ed25519 public key
      table
        .enum('status', ['pending_key', 'active', 'revoked'])
        .notNullable()
        .defaultTo('pending_key');
      table.timestamp('last_used_at').nullable();
      table.timestamps(true, true);

      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.unique(['user_id', 'app_device_id']);
      table.index(['user_id']);
      table.index(['status']);
    });
  }

  // device_key_distributions
  const hasDistributions = await knex.schema.hasTable('device_key_distributions');
  if (!hasDistributions) {
    await knex.schema.createTable('device_key_distributions', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      table.uuid('user_device_id').notNullable();
      table
        .enum('target_type', ['blulok', 'access_control'])
        .notNullable();
      table.uuid('target_id').notNullable();
      table
        .enum('status', ['pending_add', 'added', 'pending_remove', 'removed', 'failed'])
        .notNullable()
        .defaultTo('pending_add');
      table.timestamp('last_attempt_at').nullable();
      table.text('error').nullable();
      table.timestamps(true, true);

      table.foreign('user_device_id').references('id').inTable('user_devices').onDelete('CASCADE');
      table.index(['user_device_id']);
      table.index(['target_type', 'target_id']);
      table.index(['status']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasDistributions = await knex.schema.hasTable('device_key_distributions');
  if (hasDistributions) {
    await knex.schema.dropTableIfExists('device_key_distributions');
  }

  const hasUserDevices = await knex.schema.hasTable('user_devices');
  if (hasUserDevices) {
    await knex.schema.dropTableIfExists('user_devices');
  }

  const hasUsers = await knex.schema.hasTable('users');
  if (hasUsers) {
    const hasKeyStatus = await knex.schema.hasColumn('users', 'key_status');
    if (hasKeyStatus) {
      await knex.schema.alterTable('users', (table) => {
        table.dropColumn('key_status');
      });
    }
  }
}


