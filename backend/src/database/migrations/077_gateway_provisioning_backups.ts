import type { Knex } from 'knex';

/**
 * Gateway mesh provisioning backup storage (zip uploads from field gateways).
 */
export async function up(knex: Knex): Promise<void> {
  const hasBackups = await knex.schema.hasTable('gateway_provisioning_backups');
  if (!hasBackups) {
    await knex.schema.createTable('gateway_provisioning_backups', (table) => {
      table.string('id', 36).primary();
      table.string('gateway_id', 36).notNullable();
      table.string('facility_id', 36).notNullable();
      table.string('filename', 255).notNullable();
      table.bigInteger('size_bytes').unsigned().notNullable();
      table.string('sha256_hash', 64).notNullable();
      table.string('storage_path', 512).notNullable();
      table
        .enum('upload_source', ['gateway_push', 'cloud_requested'])
        .notNullable()
        .defaultTo('gateway_push');
      table.string('created_by', 36).nullable();
      table.timestamp('uploaded_at').notNullable().defaultTo(knex.fn.now());
      table.timestamps(true, true);

      table.foreign('gateway_id').references('id').inTable('gateways').onDelete('CASCADE');
      table.foreign('facility_id').references('id').inTable('facilities').onDelete('CASCADE');
      table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');

      table.index(['gateway_id', 'uploaded_at'], 'idx_gw_prov_backups_gateway_uploaded');
      table.index(['facility_id', 'uploaded_at'], 'idx_gw_prov_backups_facility_uploaded');
    });
  }

  const hasRestores = await knex.schema.hasTable('gateway_provisioning_restores');
  if (!hasRestores) {
    await knex.schema.createTable('gateway_provisioning_restores', (table) => {
      table.string('id', 36).primary();
      table.string('backup_id', 36).notNullable();
      table.string('gateway_id', 36).notNullable();
      table.string('facility_id', 36).notNullable();
      table
        .enum('status', ['pending', 'transferring', 'verifying', 'complete', 'failed', 'cancelled'])
        .notNullable()
        .defaultTo('pending');
      table.integer('chunks_total').unsigned().nullable();
      table.integer('chunks_sent').unsigned().notNullable().defaultTo(0);
      table.string('nonce', 128).nullable();
      table.text('error_message').nullable();
      table.string('initiated_by', 36).notNullable();
      table.timestamp('started_at').nullable();
      table.timestamp('completed_at').nullable();
      table.timestamps(true, true);

      table.foreign('backup_id').references('id').inTable('gateway_provisioning_backups').onDelete('CASCADE');
      table.foreign('gateway_id').references('id').inTable('gateways').onDelete('CASCADE');
      table.foreign('facility_id').references('id').inTable('facilities').onDelete('CASCADE');
      table.foreign('initiated_by').references('id').inTable('users').onDelete('CASCADE');

      table.index(['gateway_id', 'status'], 'idx_gw_prov_restores_gateway_status');
      table.index(['facility_id', 'created_at'], 'idx_gw_prov_restores_facility_created');
    });
  }

  const hasEvents = await knex.schema.hasTable('gateway_provisioning_restore_events');
  if (!hasEvents) {
    await knex.schema.createTable('gateway_provisioning_restore_events', (table) => {
      table.string('id', 36).primary();
      table.string('restore_id', 36).notNullable();
      table.string('event_type', 64).notNullable();
      table.text('message').nullable();
      table.json('metadata').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

      table.foreign('restore_id').references('id').inTable('gateway_provisioning_restores').onDelete('CASCADE');
      table.index(['restore_id', 'created_at'], 'idx_gw_prov_restore_events_restore_created');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('gateway_provisioning_restore_events');
  await knex.schema.dropTableIfExists('gateway_provisioning_restores');
  await knex.schema.dropTableIfExists('gateway_provisioning_backups');
}
