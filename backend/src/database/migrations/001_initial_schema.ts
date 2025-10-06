import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Users table
  if (!(await knex.schema.hasTable('users'))) {
    await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).notNullable();
    table.enum('role', ['tenant', 'admin', 'maintenance', 'blulok_technician', 'dev_admin']).notNullable().defaultTo('tenant');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('last_login').nullable();
    table.timestamps(true, true);
    
    table.index(['email']);
    table.index(['role']);
    table.index(['is_active']);
    });
  }

  // Facilities table
  if (!(await knex.schema.hasTable('facilities'))) {
    await knex.schema.createTable('facilities', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.string('name', 255).notNullable();
    table.text('description').nullable();
    table.string('address', 500).notNullable();
    table.string('city', 100).notNullable();
    table.string('state', 50).notNullable();
    table.string('zip_code', 20).notNullable();
    table.string('country', 50).notNullable().defaultTo('US');
    table.decimal('latitude', 10, 8).nullable();
    table.decimal('longitude', 11, 8).nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamps(true, true);
    
    table.index(['name']);
    table.index(['is_active']);
    });
  }

  // Device types table
  if (!(await knex.schema.hasTable('device_types'))) {
    await knex.schema.createTable('device_types', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.string('name', 100).notNullable().unique();
    table.text('description').nullable();
    table.json('capabilities').nullable(); // JSON array of capabilities
    table.timestamps(true, true);
    });
  }

  // Devices table (BluLok units)
  if (!(await knex.schema.hasTable('devices'))) {
    await knex.schema.createTable('devices', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.uuid('facility_id').notNullable();
    table.uuid('device_type_id').notNullable();
    table.string('serial_number', 100).notNullable().unique();
    table.string('name', 255).notNullable();
    table.text('description').nullable();
    table.string('location', 255).nullable(); // Physical location within facility
    table.enum('status', ['online', 'offline', 'maintenance', 'error']).notNullable().defaultTo('offline');
    table.string('firmware_version', 50).nullable();
    table.json('configuration').nullable(); // Device-specific configuration
    table.timestamp('last_heartbeat').nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamps(true, true);
    
    table.foreign('facility_id').references('id').inTable('facilities').onDelete('CASCADE');
    table.foreign('device_type_id').references('id').inTable('device_types').onDelete('RESTRICT');
    table.index(['facility_id']);
    table.index(['device_type_id']);
    table.index(['serial_number']);
    table.index(['status']);
    table.index(['is_active']);
    });
  }

  // Access logs table
  if (!(await knex.schema.hasTable('access_logs'))) {
    await knex.schema.createTable('access_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.uuid('device_id').notNullable();
    table.uuid('user_id').nullable(); // Null for system actions
    table.enum('action', ['lock', 'unlock', 'access_granted', 'access_denied', 'heartbeat', 'status_change']).notNullable();
    table.enum('result', ['success', 'failure', 'timeout']).notNullable();
    table.text('details').nullable(); // Additional context
    table.string('ip_address', 45).nullable(); // IPv4 or IPv6
    table.timestamp('timestamp').notNullable().defaultTo(knex.fn.now());
    
    table.foreign('device_id').references('id').inTable('devices').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.index(['device_id']);
    table.index(['user_id']);
    table.index(['action']);
    table.index(['timestamp']);
    });
  }

  // User facility permissions (deprecated - will be removed in migration 002)
  if (!(await knex.schema.hasTable('user_facility_permissions'))) {
    await knex.schema.createTable('user_facility_permissions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.uuid('user_id').notNullable();
    table.uuid('facility_id').notNullable();
    table.json('permissions').notNullable(); // Array of permission strings
    table.timestamps(true, true);
    
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('facility_id').references('id').inTable('facilities').onDelete('CASCADE');
    table.unique(['user_id', 'facility_id']);
    table.index(['user_id']);
    table.index(['facility_id']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_facility_permissions');
  await knex.schema.dropTableIfExists('access_logs');
  await knex.schema.dropTableIfExists('devices');
  await knex.schema.dropTableIfExists('device_types');
  await knex.schema.dropTableIfExists('facilities');
  await knex.schema.dropTableIfExists('users');
}
