import { Knex } from 'knex';

const ACCESS_METHOD_DEFAULT = JSON.stringify(['app']);

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('device_groups'))) {
    await knex.schema.createTable('device_groups', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      table.uuid('facility_id').notNullable();
      table.string('name', 255).notNullable();
      table.text('description').nullable();
      table.enum('group_type', ['access_zone', 'code_group']).notNullable().defaultTo('access_zone');
      table.json('settings').nullable();
      table.json('metadata').nullable();
      table.boolean('is_active').notNullable().defaultTo(true);
      table.timestamps(true, true);

      table.foreign('facility_id').references('id').inTable('facilities').onDelete('CASCADE');
      table.unique(['facility_id', 'name'], 'uq_device_groups_facility_name');
      table.index(['facility_id', 'group_type'], 'idx_device_groups_facility_type');
    });
  }

  if (!(await knex.schema.hasTable('device_group_members'))) {
    await knex.schema.createTable('device_group_members', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      table.uuid('group_id').notNullable();
      table.uuid('device_id').notNullable();
      table.enum('device_type', ['access_control', 'blulok']).notNullable().defaultTo('access_control');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

      table.foreign('group_id').references('id').inTable('device_groups').onDelete('CASCADE');
      table.unique(['group_id', 'device_id', 'device_type'], 'uq_device_group_members_group_device_type');
      table.index(['group_id'], 'idx_device_group_members_group');
      table.index(['device_id', 'device_type'], 'idx_device_group_members_device');
    });
  }

  if (!(await knex.schema.hasTable('access_code_configs'))) {
    await knex.schema.createTable('access_code_configs', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      table.uuid('facility_id').notNullable().unique();
      table.boolean('is_enabled').notNullable().defaultTo(false);
      table.specificType('digit_count', 'TINYINT UNSIGNED').notNullable().defaultTo(6);
      table.decimal('rotation_interval_hours', 10, 4).unsigned().notNullable().defaultTo(24);
      table.specificType('rotation_hour', 'TINYINT UNSIGNED').notNullable().defaultTo(0);
      table.specificType('rotation_minute', 'TINYINT UNSIGNED').notNullable().defaultTo(0);
      table.timestamps(true, true);

      table.foreign('facility_id').references('id').inTable('facilities').onDelete('CASCADE');
      table.index(['facility_id', 'is_enabled'], 'idx_access_code_configs_facility_enabled');
    });
  }

  if (!(await knex.schema.hasTable('access_codes'))) {
    await knex.schema.createTable('access_codes', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      table.uuid('facility_id').notNullable();
      table.enum('scope_type', ['device_group', 'device']).notNullable();
      table.string('scope_id', 36).nullable();
      table.string('code', 8).notNullable();
      table.timestamp('valid_from').notNullable();
      table.timestamp('valid_until').notNullable();
      table.boolean('is_active').notNullable().defaultTo(true);
      table.enum('generated_by', ['system', 'admin']).notNullable().defaultTo('system');
      table.uuid('set_by_user_id').nullable();
      table.timestamps(true, true);

      table.foreign('facility_id').references('id').inTable('facilities').onDelete('CASCADE');
      table.foreign('set_by_user_id').references('id').inTable('users').onDelete('SET NULL');
      table.index(['facility_id', 'is_active', 'valid_until'], 'idx_access_codes_facility_active_valid_until');
      table.index(['scope_type', 'scope_id', 'is_active'], 'idx_access_codes_scope_active');
    });
  }

  const hasAccessMethods = await knex.schema.hasColumn('access_control_devices', 'access_methods');
  if (!hasAccessMethods) {
    await knex.schema.alterTable('access_control_devices', (table) => {
      // MySQL does not allow JSON defaults in DDL on some versions; backfill after add.
      table.json('access_methods').nullable().after('device_settings');
    });
  }

  const hasAccessMethodsAfterAdd = await knex.schema.hasColumn('access_control_devices', 'access_methods');
  if (hasAccessMethodsAfterAdd) {
    await knex('access_control_devices')
      .whereNull('access_methods')
      .update({ access_methods: ACCESS_METHOD_DEFAULT });

    await knex.raw('ALTER TABLE `access_control_devices` MODIFY COLUMN `access_methods` JSON NOT NULL');
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('access_control_devices', 'access_methods')) {
    await knex.schema.alterTable('access_control_devices', (table) => {
      table.dropColumn('access_methods');
    });
  }

  await knex.schema.dropTableIfExists('access_codes');
  await knex.schema.dropTableIfExists('access_code_configs');
  await knex.schema.dropTableIfExists('device_group_members');
  await knex.schema.dropTableIfExists('device_groups');
}

