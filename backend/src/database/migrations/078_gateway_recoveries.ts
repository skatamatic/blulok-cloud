import type { Knex } from 'knex';

/**
 * Gateway swap / recovery flow — phased recovery before inventory sync is trusted.
 */
export async function up(knex: Knex): Promise<void> {
  const hasSnapshots = await knex.schema.hasTable('gateway_inventory_snapshots');
  if (!hasSnapshots) {
    await knex.schema.createTable('gateway_inventory_snapshots', (table) => {
      table.string('id', 36).primary();
      table.string('gateway_id', 36).notNullable();
      table.string('facility_id', 36).notNullable();
      table.string('sha256_hash', 64).notNullable();
      table.bigInteger('size_bytes').unsigned().notNullable();
      table.string('storage_path', 512).notNullable();
      table.integer('device_count').unsigned().notNullable().defaultTo(0);
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

      table.foreign('gateway_id').references('id').inTable('gateways').onDelete('CASCADE');
      table.foreign('facility_id').references('id').inTable('facilities').onDelete('CASCADE');
      table.index(['facility_id', 'created_at'], 'idx_gw_inv_snapshots_facility_created');
    });
  }

  const hasRecoveries = await knex.schema.hasTable('gateway_recoveries');
  if (!hasRecoveries) {
    await knex.schema.createTable('gateway_recoveries', (table) => {
      table.string('id', 36).primary();
      table.string('facility_id', 36).notNullable();
      table.string('gateway_id', 36).notNullable();
      table.string('previous_gateway_id', 36).nullable();
      table
        .enum('status', [
          'detected',
          'awaiting_config',
          'firmware',
          'provisioning',
          'inventory_push',
          'complete',
          'failed',
          'cancelled',
          'bypassed',
        ])
        .notNullable()
        .defaultTo('detected');
      table.string('firmware_id', 36).nullable();
      table.string('provisioning_backup_id', 36).nullable();
      table.string('inventory_snapshot_id', 36).nullable();
      table.string('firmware_push_id', 36).nullable();
      table.string('provisioning_restore_id', 36).nullable();
      table.integer('inventory_chunks_total').unsigned().nullable();
      table.integer('inventory_chunks_sent').unsigned().notNullable().defaultTo(0);
      table.string('inventory_nonce', 128).nullable();
      table.boolean('bypassed').notNullable().defaultTo(false);
      table.text('error_message').nullable();
      table.string('initiated_by', 36).nullable();
      table.timestamp('started_at').nullable();
      table.timestamp('completed_at').nullable();
      table.timestamps(true, true);

      table.foreign('facility_id').references('id').inTable('facilities').onDelete('CASCADE');
      table.foreign('gateway_id').references('id').inTable('gateways').onDelete('CASCADE');
      table.foreign('previous_gateway_id').references('id').inTable('gateways').onDelete('SET NULL');
      table.foreign('firmware_id').references('id').inTable('firmware_images').onDelete('SET NULL');
      table.foreign('provisioning_backup_id').references('id').inTable('gateway_provisioning_backups').onDelete('SET NULL');
      table.foreign('inventory_snapshot_id').references('id').inTable('gateway_inventory_snapshots').onDelete('SET NULL');
      table.foreign('firmware_push_id').references('id').inTable('firmware_pushes').onDelete('SET NULL');
      table.foreign('provisioning_restore_id').references('id').inTable('gateway_provisioning_restores').onDelete('SET NULL');
      table.foreign('initiated_by').references('id').inTable('users').onDelete('SET NULL');

      table.index(['facility_id', 'status'], 'idx_gw_recoveries_facility_status');
      table.index(['gateway_id', 'created_at'], 'idx_gw_recoveries_gateway_created');
    });
  }

  const hasEvents = await knex.schema.hasTable('gateway_recovery_events');
  if (!hasEvents) {
    await knex.schema.createTable('gateway_recovery_events', (table) => {
      table.string('id', 36).primary();
      table.string('recovery_id', 36).notNullable();
      table.string('phase', 64).notNullable();
      table.text('message').nullable();
      table.integer('progress_percent').unsigned().nullable();
      table.json('metadata').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

      table.foreign('recovery_id').references('id').inTable('gateway_recoveries').onDelete('CASCADE');
      table.index(['recovery_id', 'created_at'], 'idx_gw_recovery_events_recovery_created');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('gateway_recovery_events');
  await knex.schema.dropTableIfExists('gateway_recoveries');
  await knex.schema.dropTableIfExists('gateway_inventory_snapshots');
}
