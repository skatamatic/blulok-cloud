import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('access_control_devices');
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn('access_control_devices', 'device_serial');
  if (!hasColumn) {
    await knex.schema.alterTable('access_control_devices', (table) => {
      table.string('device_serial', 100).nullable();
      table.index(['gateway_id', 'device_serial'], 'idx_access_control_gateway_serial');
    });
  }

  const rows = await knex('access_control_devices').select('id', 'relay_channel', 'metadata', 'device_serial');
  for (const row of rows) {
    if (row.device_serial && String(row.device_serial).trim().length > 0) {
      continue;
    }
    let serial: string | null = null;
    if (row.metadata) {
      try {
        const meta =
          typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
        const external = meta?.external_id ?? meta?.device_serial ?? meta?.serial;
        if (typeof external === 'string' && external.trim().length > 0) {
          serial = external.trim();
        }
      } catch {
        /* ignore malformed metadata */
      }
    }
    if (!serial) {
      serial = `legacy-${String(row.id).slice(0, 8)}-r${row.relay_channel}`;
    }
    await knex('access_control_devices').where('id', row.id).update({ device_serial: serial });
  }

  await knex.schema.alterTable('access_control_devices', (table) => {
    table.string('device_serial', 100).notNullable().alter();
  });

  const hasCompositeUnique = await knex.schema.hasColumn('access_control_devices', 'device_serial');
  if (hasCompositeUnique) {
    try {
      await knex.schema.alterTable('access_control_devices', (table) => {
        table.unique(
          ['gateway_id', 'device_serial', 'relay_channel'],
          'uq_access_control_gateway_serial_relay'
        );
      });
    } catch {
      /* index may already exist from a partial run */
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('access_control_devices');
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn('access_control_devices', 'device_serial');
  if (!hasColumn) return;

  try {
    await knex.schema.alterTable('access_control_devices', (table) => {
      table.dropUnique(
        ['gateway_id', 'device_serial', 'relay_channel'],
        'uq_access_control_gateway_serial_relay'
      );
    });
  } catch {
    /* ignore */
  }

  try {
    await knex.schema.alterTable('access_control_devices', (table) => {
      table.dropIndex(['gateway_id', 'device_serial'], 'idx_access_control_gateway_serial');
    });
  } catch {
    /* ignore */
  }

  await knex.schema.alterTable('access_control_devices', (table) => {
    table.dropColumn('device_serial');
  });
}
