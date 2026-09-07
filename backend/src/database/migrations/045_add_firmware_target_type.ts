import { Knex } from 'knex';

/**
 * Add target_type to firmware tables
 *
 * Firmware can now target different device types:
 * - gateway: applied to the gateway itself (existing behaviour)
 * - lock: broadcast to all BluLok locks on the gateway's BLE network
 * - friend_node: broadcast to all friend nodes (BLE mesh relays) on the network
 *
 * Changes:
 * - firmware_images: add target_type enum, replace unique(version) with unique(version, target_type)
 * - firmware_pushes: add target_type enum, update index to scope active-push check per type
 */
export async function up(knex: Knex): Promise<void> {
  // --- firmware_images ---
  const hasTargetTypeCol = await knex.schema.hasColumn('firmware_images', 'target_type');
  if (!hasTargetTypeCol) {
    await knex.schema.alterTable('firmware_images', (table) => {
      table
        .enum('target_type', ['gateway', 'lock', 'friend_node'])
        .notNullable()
        .defaultTo('gateway')
        .after('version');
    });

    // Drop the existing unique constraint on version alone
    // MySQL unique index name derived from column: firmware_images_version_unique
    try {
      await knex.schema.alterTable('firmware_images', (table) => {
        table.dropUnique(['version']);
      });
    } catch {
      // Index may have a different name; try raw fallback
      try {
        await knex.raw('ALTER TABLE firmware_images DROP INDEX firmware_images_version_unique');
      } catch {
        // Already dropped or never existed as expected name
      }
    }

    // Add composite unique on (version, target_type)
    await knex.schema.alterTable('firmware_images', (table) => {
      table.unique(['version', 'target_type'], { indexName: 'uq_firmware_images_version_target' });
    });

    console.log('Added target_type to firmware_images, updated unique constraint');
  }

  // --- firmware_pushes ---
  const hasPushTargetType = await knex.schema.hasColumn('firmware_pushes', 'target_type');
  if (!hasPushTargetType) {
    await knex.schema.alterTable('firmware_pushes', (table) => {
      table
        .enum('target_type', ['gateway', 'lock', 'friend_node'])
        .notNullable()
        .defaultTo('gateway')
        .after('facility_id');
    });

    // Replace the old gateway+status index with one that includes target_type
    try {
      await knex.schema.alterTable('firmware_pushes', (table) => {
        table.dropIndex([], 'idx_firmware_pushes_gateway_status');
      });
    } catch {
      // Index may not exist
    }

    await knex.schema.alterTable('firmware_pushes', (table) => {
      table.index(
        ['gateway_id', 'target_type', 'status'],
        'idx_firmware_pushes_gw_target_status',
      );
    });

    console.log('Added target_type to firmware_pushes, updated index');
  }
}

export async function down(knex: Knex): Promise<void> {
  // --- firmware_pushes ---
  const hasPushTargetType = await knex.schema.hasColumn('firmware_pushes', 'target_type');
  if (hasPushTargetType) {
    try {
      await knex.schema.alterTable('firmware_pushes', (table) => {
        table.dropIndex([], 'idx_firmware_pushes_gw_target_status');
      });
    } catch {}

    await knex.schema.alterTable('firmware_pushes', (table) => {
      table.dropColumn('target_type');
      table.index(['gateway_id', 'status'], 'idx_firmware_pushes_gateway_status');
    });

    console.log('Reverted firmware_pushes target_type');
  }

  // --- firmware_images ---
  const hasTargetTypeCol = await knex.schema.hasColumn('firmware_images', 'target_type');
  if (hasTargetTypeCol) {
    try {
      await knex.schema.alterTable('firmware_images', (table) => {
        table.dropUnique([], 'uq_firmware_images_version_target' as any);
      });
    } catch {}

    await knex.schema.alterTable('firmware_images', (table) => {
      table.dropColumn('target_type');
    });

    // Restore original unique on version
    await knex.schema.alterTable('firmware_images', (table) => {
      table.unique(['version']);
    });

    console.log('Reverted firmware_images target_type');
  }
}
