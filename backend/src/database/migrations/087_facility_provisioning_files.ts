import type { Knex } from 'knex';

/**
 * Replace gateway provisioning backups with facility-scoped provisioning files.
 * Forward-only: drops gateway provisioning tables and recovery FK columns.
 */
export async function up(knex: Knex): Promise<void> {
  const hasRecoveries = await knex.schema.hasTable('gateway_recoveries');
  if (hasRecoveries) {
    const hasProvRestoreCol = await knex.schema.hasColumn('gateway_recoveries', 'provisioning_restore_id');
    if (hasProvRestoreCol) {
      await knex.schema.alterTable('gateway_recoveries', (table) => {
        table.dropForeign(['provisioning_restore_id']);
        table.dropColumn('provisioning_restore_id');
      });
    }

    const hasProvBackupCol = await knex.schema.hasColumn('gateway_recoveries', 'provisioning_backup_id');
    if (hasProvBackupCol) {
      await knex.schema.alterTable('gateway_recoveries', (table) => {
        table.dropForeign(['provisioning_backup_id']);
        table.dropColumn('provisioning_backup_id');
      });
    }

    // Migrate any rows stuck in the removed status to failed BEFORE altering the
    // enum — MySQL clobbers rows holding a removed enum value (sets them to '')
    // the moment the column is modified, so this cleanup must run first.
    await knex('gateway_recoveries').where('status', 'provisioning').update({
      status: 'failed',
      error_message: 'Provisioning phase removed — retry recovery from firmware or inventory',
    });

    // Remove 'provisioning' from status enum (MySQL requires full enum list).
    await knex.raw(`
      ALTER TABLE gateway_recoveries
      MODIFY COLUMN status ENUM(
        'detected',
        'awaiting_config',
        'firmware',
        'inventory_push',
        'complete',
        'failed',
        'cancelled',
        'bypassed'
      ) NOT NULL DEFAULT 'detected'
    `);
  }

  await knex.schema.dropTableIfExists('gateway_provisioning_restore_events');
  await knex.schema.dropTableIfExists('gateway_provisioning_restores');
  await knex.schema.dropTableIfExists('gateway_provisioning_backups');

  const hasFiles = await knex.schema.hasTable('facility_provisioning_files');
  if (!hasFiles) {
    await knex.schema.createTable('facility_provisioning_files', (table) => {
      table.string('id', 36).primary();
      table.string('facility_id', 36).notNullable();
      table.string('filename', 255).notNullable();
      table.string('content_type', 255).nullable();
      table.bigInteger('size_bytes').unsigned().notNullable();
      table.string('sha256_hash', 64).notNullable();
      table.string('storage_path', 512).notNullable();
      table.enum('upload_source', ['app', 'dashboard']).notNullable().defaultTo('dashboard');
      table.string('created_by', 36).nullable();
      table.timestamp('uploaded_at').notNullable().defaultTo(knex.fn.now());
      table.timestamps(true, true);

      table.foreign('facility_id').references('id').inTable('facilities').onDelete('CASCADE');
      table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');
      table.index(['facility_id', 'uploaded_at'], 'idx_fac_prov_files_facility_uploaded');
    });
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Forward-only migration — restoring dropped gateway provisioning tables is not supported.
}
