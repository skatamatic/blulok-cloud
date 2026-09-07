import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('device_deletion_outbox', 'device_serial');
  if (hasColumn) {
    return;
  }

  await knex.schema.alterTable('device_deletion_outbox', (table) => {
    table.string('device_serial', 128).nullable();
    table.index(
      ['facility_id', 'device_kind', 'device_serial'],
      'idx_device_del_outbox_infra',
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('device_deletion_outbox', 'device_serial');
  if (!hasColumn) {
    return;
  }

  await knex.schema.alterTable('device_deletion_outbox', (table) => {
    table.dropIndex(['facility_id', 'device_kind', 'device_serial'], 'idx_device_del_outbox_infra');
    table.dropColumn('device_serial');
  });
}
