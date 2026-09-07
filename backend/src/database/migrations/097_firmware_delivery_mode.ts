import { Knex } from 'knex';

/**
 * Firmware OTA delivery mode: v1 = WebSocket chunking, v2 = GCS signed download URL.
 * See cursorDocs/firmware-ota-architecture.md
 */
export async function up(knex: Knex): Promise<void> {
  const hasPushes = await knex.schema.hasTable('firmware_pushes');
  if (hasPushes) {
    const hasCol = await knex.schema.hasColumn('firmware_pushes', 'delivery_mode');
    if (!hasCol) {
      await knex.schema.alterTable('firmware_pushes', (table) => {
        table.string('delivery_mode', 8).notNullable().defaultTo('v1');
      });
    }
  }

  const hasRecoveries = await knex.schema.hasTable('gateway_recoveries');
  if (hasRecoveries) {
    const hasCol = await knex.schema.hasColumn('gateway_recoveries', 'firmware_delivery_mode');
    if (!hasCol) {
      await knex.schema.alterTable('gateway_recoveries', (table) => {
        table.string('firmware_delivery_mode', 8).notNullable().defaultTo('v1');
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasPushes = await knex.schema.hasTable('firmware_pushes');
  if (hasPushes) {
    const hasCol = await knex.schema.hasColumn('firmware_pushes', 'delivery_mode');
    if (hasCol) {
      await knex.schema.alterTable('firmware_pushes', (table) => {
        table.dropColumn('delivery_mode');
      });
    }
  }

  const hasRecoveries = await knex.schema.hasTable('gateway_recoveries');
  if (hasRecoveries) {
    const hasCol = await knex.schema.hasColumn('gateway_recoveries', 'firmware_delivery_mode');
    if (hasCol) {
      await knex.schema.alterTable('gateway_recoveries', (table) => {
        table.dropColumn('firmware_delivery_mode');
      });
    }
  }
}
