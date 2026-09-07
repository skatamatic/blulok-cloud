import { Knex } from 'knex';

/**
 * Extend device_denylist_entries to support access_control devices (app-entry doors/gates)
 * in addition to blulok locks. Replaces the blulok-only FK with device_type discriminator.
 */
export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('device_denylist_entries');
  if (!hasTable) {
    return;
  }

  const hasDeviceType = await knex.schema.hasColumn('device_denylist_entries', 'device_type');
  if (!hasDeviceType) {
    await knex.schema.alterTable('device_denylist_entries', (table) => {
      table
        .enum('device_type', ['blulok', 'access_control'])
        .notNullable()
        .defaultTo('blulok');
    });
  }

  // MySQL FK only referenced blulok_devices; access_control UUIDs must be allowed.
  try {
    await knex.schema.alterTable('device_denylist_entries', (table) => {
      table.dropForeign(['device_id'], 'device_denylist_entries_device_id_foreign');
    });
  } catch {
    try {
      await knex.schema.alterTable('device_denylist_entries', (table) => {
        table.dropForeign(['device_id']);
      });
    } catch {
      // Constraint may already be absent in some environments.
    }
  }

  const hasDeviceTypeIndex = await knex.schema.hasColumn('device_denylist_entries', 'device_type');
  if (hasDeviceTypeIndex) {
    const [indexRows] = await knex.raw(
      `SHOW INDEX FROM device_denylist_entries WHERE Key_name = 'idx_device_denylist_device_type'`,
    ) as any[];
    if (!Array.isArray(indexRows) || indexRows.length === 0) {
      await knex.schema.alterTable('device_denylist_entries', (table) => {
        table.index(['device_type'], 'idx_device_denylist_device_type');
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('device_denylist_entries');
  if (!hasTable) {
    return;
  }

  const hasDeviceType = await knex.schema.hasColumn('device_denylist_entries', 'device_type');
  if (hasDeviceType) {
    await knex('device_denylist_entries').where('device_type', 'access_control').del();
    await knex.schema.alterTable('device_denylist_entries', (table) => {
      table.dropIndex(['device_type'], 'idx_device_denylist_device_type');
      table.dropColumn('device_type');
    });
  }

  try {
    await knex.schema.alterTable('device_denylist_entries', (table) => {
      table.foreign('device_id').references('id').inTable('blulok_devices').onDelete('CASCADE');
    });
  } catch {
    // Ignore if FK cannot be restored (orphaned rows).
  }
}
