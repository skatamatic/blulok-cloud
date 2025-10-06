import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create facilities table
  if (!(await knex.schema.hasTable('facilities'))) {
    await knex.schema.createTable('facilities', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      table.string('name', 255).notNullable();
      table.text('description').nullable();
      table.string('address', 500).notNullable();
      table.decimal('latitude', 10, 8).nullable();
      table.decimal('longitude', 11, 8).nullable();
      table.string('branding_image_url', 500).nullable();
      table.string('contact_email', 255).nullable();
      table.string('contact_phone', 50).nullable();
      table.enum('status', ['active', 'inactive', 'maintenance']).defaultTo('active');
      table.json('metadata').nullable(); // Additional facility-specific data
      table.timestamps(true, true);
      
      table.index(['status']);
      table.index(['name']);
    });
  }

  // Create gateways table (1 per facility)
  if (!(await knex.schema.hasTable('gateways'))) {
    await knex.schema.createTable('gateways', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      table.uuid('facility_id').notNullable();
      table.string('name', 255).notNullable();
      table.string('model', 100).nullable();
      table.string('firmware_version', 50).nullable();
      table.string('ip_address', 45).nullable(); // IPv6 support
      table.string('mac_address', 17).nullable();
      table.enum('status', ['online', 'offline', 'error', 'maintenance']).defaultTo('offline');
      table.timestamp('last_seen').nullable();
      table.json('configuration').nullable(); // Gateway-specific settings
      table.json('metadata').nullable();
      table.timestamps(true, true);
      
      table.foreign('facility_id').references('id').inTable('facilities').onDelete('CASCADE');
      table.index(['facility_id']);
      table.index(['status']);
      table.unique(['facility_id']); // One gateway per facility
    });
  }

  // Create access_control_devices table (gates, elevators, doors)
  if (!(await knex.schema.hasTable('access_control_devices'))) {
    await knex.schema.createTable('access_control_devices', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      table.uuid('gateway_id').notNullable();
      table.string('name', 255).notNullable();
      table.enum('device_type', ['gate', 'elevator', 'door']).notNullable();
      table.string('location_description', 255).nullable(); // "Main entrance", "Loading dock", etc.
      table.integer('relay_channel').notNullable(); // Which relay channel on the gateway
      table.enum('status', ['online', 'offline', 'error', 'maintenance']).defaultTo('offline');
      table.boolean('is_locked').defaultTo(true);
      table.timestamp('last_activity').nullable();
      table.json('device_settings').nullable(); // Device-specific configuration
      table.json('metadata').nullable();
      table.timestamps(true, true);
      
      table.foreign('gateway_id').references('id').inTable('gateways').onDelete('CASCADE');
      table.index(['gateway_id']);
      table.index(['device_type']);
      table.index(['status']);
      table.unique(['gateway_id', 'relay_channel']); // Unique relay channel per gateway
    });
  }

  // Create units table (storage units within facilities)
  if (!(await knex.schema.hasTable('units'))) {
    await knex.schema.createTable('units', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      table.uuid('facility_id').notNullable();
      table.string('unit_number', 50).notNullable(); // "A101", "B-205", etc.
      table.string('unit_type', 100).nullable(); // "Small", "Medium", "Large", "Climate Controlled"
      table.decimal('size_sqft', 8, 2).nullable();
      table.decimal('monthly_rate', 10, 2).nullable();
      table.enum('status', ['available', 'occupied', 'maintenance', 'reserved']).defaultTo('available');
      table.text('description').nullable();
      table.json('features').nullable(); // ["climate_controlled", "drive_up", "ground_floor"]
      table.json('metadata').nullable();
      table.timestamps(true, true);
      
      table.foreign('facility_id').references('id').inTable('facilities').onDelete('CASCADE');
      table.index(['facility_id']);
      table.index(['status']);
      table.index(['unit_number']);
      table.unique(['facility_id', 'unit_number']); // Unique unit number per facility
    });
  }

  // Create blulok_devices table (smart locks - 1:1 with units)
  if (!(await knex.schema.hasTable('blulok_devices'))) {
    await knex.schema.createTable('blulok_devices', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      table.uuid('gateway_id').notNullable();
      table.uuid('unit_id').notNullable();
      table.string('device_serial', 100).notNullable().unique();
      table.string('firmware_version', 50).nullable();
      table.enum('lock_status', ['locked', 'unlocked', 'error', 'maintenance']).defaultTo('locked');
      table.enum('device_status', ['online', 'offline', 'low_battery', 'error']).defaultTo('offline');
      table.integer('battery_level').nullable(); // 0-100
      table.timestamp('last_activity').nullable();
      table.timestamp('last_seen').nullable();
      table.json('device_settings').nullable(); // Lock-specific configuration
      table.json('metadata').nullable();
      table.timestamps(true, true);
      
      table.foreign('gateway_id').references('id').inTable('gateways').onDelete('CASCADE');
      table.foreign('unit_id').references('id').inTable('units').onDelete('CASCADE');
      table.index(['gateway_id']);
      table.index(['unit_id']);
      table.index(['lock_status']);
      table.index(['device_status']);
      table.unique(['unit_id']); // One BluLok device per unit
    });
  }

  // Create unit_assignments table (tenant assignments to units)
  if (!(await knex.schema.hasTable('unit_assignments'))) {
    await knex.schema.createTable('unit_assignments', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      table.uuid('unit_id').notNullable();
      table.uuid('tenant_id').notNullable(); // References users table
      table.boolean('is_primary').defaultTo(false); // Primary tenant for the unit
      table.enum('access_type', ['full', 'shared', 'temporary']).defaultTo('full');
      table.timestamp('access_granted_at').defaultTo(knex.fn.now());
      table.timestamp('access_expires_at').nullable(); // For temporary access
      table.uuid('granted_by').nullable(); // Which admin/user granted access
      table.text('notes').nullable();
      table.json('access_permissions').nullable(); // Future: time restrictions, etc.
      table.timestamps(true, true);
      
      table.foreign('unit_id').references('id').inTable('units').onDelete('CASCADE');
      table.foreign('tenant_id').references('id').inTable('users').onDelete('CASCADE');
      table.foreign('granted_by').references('id').inTable('users').onDelete('SET NULL');
      table.index(['unit_id']);
      table.index(['tenant_id']);
      table.index(['is_primary']);
      table.index(['access_type']);
      table.unique(['unit_id', 'tenant_id']); // Unique assignment per unit-tenant pair
    });
  }

  // Create access_logs table (for auditing device access)
  // Drop existing table if it exists to ensure we have the correct schema
  await knex.schema.dropTableIfExists('access_logs');
  await knex.schema.createTable('access_logs', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      table.uuid('device_id').notNullable(); // Can reference blulok_devices or access_control_devices
      table.string('device_type', 50).notNullable(); // 'blulok' or 'access_control'
      table.uuid('user_id').nullable(); // Who triggered the access
      table.enum('action', ['unlock', 'lock', 'access_granted', 'access_denied', 'manual_override']).notNullable();
      table.enum('method', ['app', 'keypad', 'card', 'manual', 'automatic']).notNullable();
      table.boolean('success').notNullable();
      table.text('reason').nullable(); // Failure reason if not successful
      table.string('ip_address', 45).nullable();
      table.json('metadata').nullable(); // Additional context
      table.timestamp('occurred_at').defaultTo(knex.fn.now());
      
      table.foreign('user_id').references('id').inTable('users').onDelete('SET NULL');
      table.index(['device_id', 'device_type']);
      table.index(['user_id']);
      table.index(['action']);
      table.index(['occurred_at']);
      table.index(['success']);
    });
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse order to handle foreign key constraints
  await knex.schema.dropTableIfExists('access_logs');
  await knex.schema.dropTableIfExists('unit_assignments');
  await knex.schema.dropTableIfExists('blulok_devices');
  await knex.schema.dropTableIfExists('units');
  await knex.schema.dropTableIfExists('access_control_devices');
  await knex.schema.dropTableIfExists('gateways');
  await knex.schema.dropTableIfExists('facilities');
}

