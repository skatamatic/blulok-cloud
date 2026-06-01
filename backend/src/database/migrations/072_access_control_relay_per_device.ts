import { Knex } from 'knex';

/**
 * Relay channel is scoped per access-control device (access_id + relay_channel),
 * not globally unique per gateway. Multiple keypads may each use relay_channel 1.
 */
export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('access_control_devices');
  if (!hasTable) return;

  const indexNames = [
    'access_control_devices_gateway_id_relay_channel_unique',
    'access_control_devices_gateway_id_relay_channel_uk',
  ];

  for (const indexName of indexNames) {
    try {
      await knex.schema.alterTable('access_control_devices', (table) => {
        table.dropUnique(['gateway_id', 'relay_channel'], indexName);
      });
      return;
    } catch {
      /* try next name or raw drop below */
    }
  }

  try {
    await knex.schema.alterTable('access_control_devices', (table) => {
      table.dropUnique(['gateway_id', 'relay_channel']);
    });
  } catch {
    /* constraint may already be absent */
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('access_control_devices');
  if (!hasTable) return;

  try {
    await knex.schema.alterTable('access_control_devices', (table) => {
      table.unique(['gateway_id', 'relay_channel']);
    });
  } catch {
    /* ignore — down may fail if duplicate relay rows exist */
  }
}
