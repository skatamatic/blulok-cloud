import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create fms_configurations table
  await knex.schema.createTable('fms_configurations', (table) => {
    table.uuid('id').primary();
    table.uuid('facility_id').notNullable();
    table.string('provider_type', 50).notNullable();
    table.boolean('is_enabled').notNullable().defaultTo(false);
    table.json('config').notNullable();
    table.timestamp('last_sync_at').nullable();
    table.string('last_sync_status', 50).nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Foreign key
    table.foreign('facility_id').references('id').inTable('facilities').onDelete('CASCADE');

    // Indexes
    table.index('facility_id');
    table.index('provider_type');
    table.index('is_enabled');
    table.index('last_sync_at');

    // Unique constraint: one FMS config per facility
    table.unique(['facility_id']);
  });

  // Create fms_sync_logs table
  await knex.schema.createTable('fms_sync_logs', (table) => {
    table.uuid('id').primary();
    table.uuid('facility_id').notNullable();
    table.uuid('fms_config_id').notNullable();
    table.string('sync_status', 50).notNullable();
    table.timestamp('started_at').notNullable();
    table.timestamp('completed_at').nullable();
    table.string('triggered_by', 20).notNullable(); // manual, automatic, webhook
    table.uuid('triggered_by_user_id').nullable();
    table.integer('changes_detected').notNullable().defaultTo(0);
    table.integer('changes_applied').notNullable().defaultTo(0);
    table.integer('changes_pending').notNullable().defaultTo(0);
    table.integer('changes_rejected').notNullable().defaultTo(0);
    table.text('error_message').nullable();
    table.json('sync_summary').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Foreign keys
    table.foreign('facility_id').references('id').inTable('facilities').onDelete('CASCADE');
    table.foreign('fms_config_id').references('id').inTable('fms_configurations').onDelete('CASCADE');
    table.foreign('triggered_by_user_id').references('id').inTable('users').onDelete('SET NULL');

    // Indexes
    table.index('facility_id');
    table.index('fms_config_id');
    table.index('sync_status');
    table.index('started_at');
    table.index('triggered_by');
    table.index(['facility_id', 'created_at']); // For fetching recent syncs
  });

  // Create fms_changes table
  await knex.schema.createTable('fms_changes', (table) => {
    table.uuid('id').primary();
    table.uuid('sync_log_id').notNullable();
    table.string('change_type', 50).notNullable();
    table.string('entity_type', 20).notNullable(); // tenant, unit
    table.string('external_id', 255).notNullable(); // FMS entity ID
    table.uuid('internal_id').nullable(); // Our entity ID (if exists)
    table.json('before_data').nullable();
    table.json('after_data').notNullable();
    table.json('required_actions').notNullable();
    table.text('impact_summary').notNullable();
    table.boolean('is_reviewed').notNullable().defaultTo(false);
    table.boolean('is_accepted').nullable();
    table.timestamp('applied_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Foreign key
    table.foreign('sync_log_id').references('id').inTable('fms_sync_logs').onDelete('CASCADE');

    // Indexes
    table.index('sync_log_id');
    table.index('change_type');
    table.index('entity_type');
    table.index('external_id');
    table.index('internal_id');
    table.index('is_reviewed');
    table.index('is_accepted');
    table.index(['sync_log_id', 'is_reviewed']); // For fetching pending changes
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('fms_changes');
  await knex.schema.dropTableIfExists('fms_sync_logs');
  await knex.schema.dropTableIfExists('fms_configurations');
}
