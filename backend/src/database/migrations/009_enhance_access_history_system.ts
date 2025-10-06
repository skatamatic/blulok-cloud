import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // First, let's enhance the existing access_logs table to be more comprehensive
  if (await knex.schema.hasTable('access_logs')) {
    // Add new columns to existing access_logs table (check if they exist first)
    const columnsToAdd = [
      { name: 'facility_id', type: 'uuid', nullable: true },
      { name: 'unit_id', type: 'uuid', nullable: true },
      { name: 'credential_id', type: 'string', length: 100, nullable: true },
      { name: 'credential_type', type: 'string', length: 50, nullable: true },
      { name: 'primary_tenant_id', type: 'uuid', nullable: true },
      { name: 'access_control_device_id', type: 'uuid', nullable: true },
      { name: 'gateway_id', type: 'uuid', nullable: true },
      { name: 'denial_reason', type: 'enum', values: [
        'invalid_credential', 'out_of_schedule', 'system_error', 'device_offline',
        'insufficient_permissions', 'expired_access', 'maintenance_mode', 'other'
      ], nullable: true },
      { name: 'location_context', type: 'string', length: 255, nullable: true },
      { name: 'session_id', type: 'string', length: 100, nullable: true },
      { name: 'device_response', type: 'json', nullable: true },
      { name: 'latitude', type: 'decimal', precision: 10, scale: 8, nullable: true },
      { name: 'longitude', type: 'decimal', precision: 11, scale: 8, nullable: true },
      { name: 'duration_seconds', type: 'integer', nullable: true }
    ];

    for (const column of columnsToAdd) {
      if (!(await knex.schema.hasColumn('access_logs', column.name))) {
        await knex.schema.alterTable('access_logs', (table) => {
          if (column.type === 'uuid') {
            table.uuid(column.name).nullable();
          } else if (column.type === 'string') {
            table.string(column.name, column.length).nullable();
          } else if (column.type === 'enum' && column.values) {
            table.enum(column.name, column.values).nullable();
          } else if (column.type === 'json') {
            table.json(column.name).nullable();
          } else if (column.type === 'decimal') {
            table.decimal(column.name, column.precision, column.scale).nullable();
          } else if (column.type === 'integer') {
            table.integer(column.name).nullable();
          }
        });
      }
    }

    // Add foreign key constraints
    const foreignKeys = [
      { column: 'facility_id', table: 'facilities' },
      { column: 'unit_id', table: 'units' },
      { column: 'primary_tenant_id', table: 'users' },
      { column: 'access_control_device_id', table: 'access_control_devices' },
      { column: 'gateway_id', table: 'gateways' }
    ];

    for (const fk of foreignKeys) {
      // Check if foreign key already exists by trying to add it
      try {
        await knex.schema.alterTable('access_logs', (table) => {
          table.foreign(fk.column).references('id').inTable(fk.table).onDelete('CASCADE');
        });
      } catch (error) {
        // Foreign key might already exist, continue
        console.log(`Foreign key ${fk.column} might already exist`);
      }
    }

    // Update enum values for action and method columns
    try {
      await knex.schema.alterTable('access_logs', (table) => {
        table.enum('action', [
          'unlock', 'lock', 'access_granted', 'access_denied', 'manual_override',
          'door_open', 'door_close', 'gate_open', 'gate_close', 'elevator_call',
          'system_error', 'timeout', 'invalid_credential', 'schedule_violation'
        ]).alter();
      });
    } catch (error) {
      console.log('Action enum might already be updated');
    }

    try {
      await knex.schema.alterTable('access_logs', (table) => {
        table.enum('method', [
          'app', 'keypad', 'card', 'manual', 'automatic', 'physical_key',
          'mobile_key', 'admin_override', 'emergency', 'scheduled'
        ]).alter();
      });
    } catch (error) {
      console.log('Method enum might already be updated');
    }
    
    // Add new indexes for better query performance (check if they exist first)
    const indexesToAdd = [
      'facility_id',
      'unit_id', 
      'primary_tenant_id',
      'access_control_device_id',
      'gateway_id',
      'credential_id',
      'credential_type',
      'denial_reason',
      'session_id'
    ];

    for (const indexColumn of indexesToAdd) {
      try {
        await knex.schema.alterTable('access_logs', (table) => {
          table.index([indexColumn]);
        });
      } catch (error) {
        console.log(`Index on ${indexColumn} might already exist`);
      }
    }

    // Add composite indexes
    try {
      await knex.schema.alterTable('access_logs', (table) => {
        table.index(['occurred_at', 'facility_id']); // Composite index for facility history
      });
    } catch (error) {
      console.log('Composite index on occurred_at, facility_id might already exist');
    }

    try {
      await knex.schema.alterTable('access_logs', (table) => {
        table.index(['occurred_at', 'user_id']); // Composite index for user history
      });
    } catch (error) {
      console.log('Composite index on occurred_at, user_id might already exist');
    }
  }

  // Create key_sharing table for managing shared access
  if (!(await knex.schema.hasTable('key_sharing'))) {
    await knex.schema.createTable('key_sharing', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      table.uuid('unit_id').notNullable();
      table.uuid('primary_tenant_id').notNullable(); // Owner of the unit
      table.uuid('shared_with_user_id').notNullable(); // User being granted access
      table.enum('access_level', ['full', 'limited', 'temporary']).defaultTo('limited');
      table.timestamp('shared_at').defaultTo(knex.fn.now());
      table.timestamp('expires_at').nullable(); // When shared access expires
      table.uuid('granted_by').nullable(); // Admin who granted the sharing
      table.text('notes').nullable(); // Notes about the sharing arrangement
      table.boolean('is_active').defaultTo(true);
      table.json('access_restrictions').nullable(); // Time restrictions, etc.
      table.timestamps(true, true);
      
      table.foreign('unit_id').references('id').inTable('units').onDelete('CASCADE');
      table.foreign('primary_tenant_id').references('id').inTable('users').onDelete('CASCADE');
      table.foreign('shared_with_user_id').references('id').inTable('users').onDelete('CASCADE');
      table.foreign('granted_by').references('id').inTable('users').onDelete('SET NULL');
      
      table.index(['unit_id']);
      table.index(['primary_tenant_id']);
      table.index(['shared_with_user_id']);
      table.index(['is_active']);
      table.index(['expires_at']);
      table.unique(['unit_id', 'shared_with_user_id']); // One sharing record per unit-user pair
    });
  }

  // Create access_schedules table for time-based access control (future feature)
  if (!(await knex.schema.hasTable('access_schedules'))) {
    await knex.schema.createTable('access_schedules', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      table.uuid('user_id').notNullable();
      table.uuid('unit_id').nullable(); // Null for facility-wide schedules
      table.uuid('access_control_device_id').nullable(); // Null for unit-wide schedules
      table.string('schedule_name', 255).notNullable();
      table.json('schedule_rules').notNullable(); // Complex schedule definition
      table.boolean('is_active').defaultTo(true);
      table.timestamp('effective_from').nullable();
      table.timestamp('effective_until').nullable();
      table.uuid('created_by').nullable();
      table.timestamps(true, true);
      
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.foreign('unit_id').references('id').inTable('units').onDelete('CASCADE');
      table.foreign('access_control_device_id').references('id').inTable('access_control_devices').onDelete('CASCADE');
      table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');
      
      table.index(['user_id']);
      table.index(['unit_id']);
      table.index(['access_control_device_id']);
      table.index(['is_active']);
      table.index(['effective_from', 'effective_until']);
    });
  }

  // Create access_credentials table for managing physical keys, cards, etc.
  if (!(await knex.schema.hasTable('access_credentials'))) {
    await knex.schema.createTable('access_credentials', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      table.uuid('user_id').notNullable();
      table.string('credential_id', 100).notNullable(); // Physical key ID, card number, etc.
      table.enum('credential_type', ['physical_key', 'card', 'mobile_app', 'keypad_code']).notNullable();
      table.string('credential_name', 255).nullable(); // Human-readable name
      table.text('description').nullable();
      table.boolean('is_active').defaultTo(true);
      table.timestamp('issued_at').defaultTo(knex.fn.now());
      table.timestamp('expires_at').nullable();
      table.uuid('issued_by').nullable();
      table.json('access_permissions').nullable(); // Which units/devices this credential can access
      table.timestamps(true, true);
      
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.foreign('issued_by').references('id').inTable('users').onDelete('SET NULL');
      
      table.index(['user_id']);
      table.index(['credential_id']);
      table.index(['credential_type']);
      table.index(['is_active']);
      table.index(['expires_at']);
      table.unique(['credential_id', 'credential_type']); // Unique credential ID per type
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop new tables
  await knex.schema.dropTableIfExists('access_credentials');
  await knex.schema.dropTableIfExists('access_schedules');
  await knex.schema.dropTableIfExists('key_sharing');
  
  // Note: We don't rollback the access_logs table changes as they're additive
  // and rolling back would require dropping and recreating the table
}
