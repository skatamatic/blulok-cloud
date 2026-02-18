import { Knex } from 'knex';

/**
 * Create firmware OTA update system tables
 *
 * Tables created:
 * - firmware_images: Catalog of uploaded firmware binaries (managed by DEV_ADMIN)
 * - firmware_pushes: Stateful push task records for tracking firmware delivery to gateways
 */
export async function up(knex: Knex): Promise<void> {
  // firmware_images: firmware binary catalog
  const hasFirmwareImagesTable = await knex.schema.hasTable('firmware_images');
  if (!hasFirmwareImagesTable) {
    await knex.schema.createTable('firmware_images', (table) => {
      table.string('id', 36).primary();
      table.string('version', 64).notNullable().unique();
      table.string('filename', 255).notNullable();
      table.string('sha256_hash', 64).notNullable();
      table.integer('size_bytes').unsigned().notNullable();
      table.text('description').nullable();
      table.text('release_notes').nullable();
      table.json('compatible_models').nullable();
      table.string('minimum_version', 64).nullable();
      table.string('storage_path', 512).notNullable();
      table.string('uploaded_by', 36).notNullable();
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);

      table.foreign('uploaded_by').references('id').inTable('users').onDelete('CASCADE');

      table.index(['is_active', 'created_at'], 'idx_firmware_images_active_created');
    });
    console.log('Created firmware_images table');
  }

  // firmware_pushes: push task state for stateful progress tracking
  const hasFirmwarePushesTable = await knex.schema.hasTable('firmware_pushes');
  if (!hasFirmwarePushesTable) {
    await knex.schema.createTable('firmware_pushes', (table) => {
      table.string('id', 36).primary();
      table.string('firmware_id', 36).notNullable();
      table.string('gateway_id', 36).notNullable();
      table.string('facility_id', 36).notNullable();
      table.enum('status', [
        'pending',
        'transferring',
        'verifying',
        'complete',
        'failed',
        'cancelled',
      ]).notNullable().defaultTo('pending');
      table.integer('chunks_total').unsigned().nullable();
      table.integer('chunks_sent').unsigned().defaultTo(0);
      table.text('error_message').nullable();
      table.string('initiated_by', 36).notNullable();
      table.datetime('started_at').nullable();
      table.datetime('completed_at').nullable();
      table.timestamps(true, true);

      table.foreign('firmware_id').references('id').inTable('firmware_images').onDelete('CASCADE');
      table.foreign('gateway_id').references('id').inTable('gateways').onDelete('CASCADE');
      table.foreign('facility_id').references('id').inTable('facilities').onDelete('CASCADE');
      table.foreign('initiated_by').references('id').inTable('users').onDelete('CASCADE');

      table.index(['gateway_id', 'status'], 'idx_firmware_pushes_gateway_status');
      table.index(['facility_id', 'created_at'], 'idx_firmware_pushes_facility_created');
    });
    console.log('Created firmware_pushes table');
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasFirmwarePushesTable = await knex.schema.hasTable('firmware_pushes');
  if (hasFirmwarePushesTable) {
    await knex.schema.dropTableIfExists('firmware_pushes');
    console.log('Dropped firmware_pushes table');
  }

  const hasFirmwareImagesTable = await knex.schema.hasTable('firmware_images');
  if (hasFirmwareImagesTable) {
    await knex.schema.dropTableIfExists('firmware_images');
    console.log('Dropped firmware_images table');
  }
}
