import type { Knex } from 'knex';
import { IN_APP_NOTIFICATION_TYPES } from '@/constants/in-app-notification.constants';

/**
 * Add device_inventory_sync_error to notifications.notification_type enum.
 */
export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('notifications');
  if (!hasTable) {
    return;
  }

  const enumValues = IN_APP_NOTIFICATION_TYPES.map((v) => `'${v}'`).join(', ');
  await knex.raw(`
    ALTER TABLE notifications
    MODIFY COLUMN notification_type ENUM(${enumValues}) NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('notifications');
  if (!hasTable) {
    return;
  }

  await knex('notifications')
    .where('notification_type', 'device_inventory_sync_error')
    .update({ notification_type: 'security_alert' });

  const withoutNewType = IN_APP_NOTIFICATION_TYPES.filter((t) => t !== 'device_inventory_sync_error');
  const enumValues = withoutNewType.map((v) => `'${v}'`).join(', ');
  await knex.raw(`
    ALTER TABLE notifications
    MODIFY COLUMN notification_type ENUM(${enumValues}) NOT NULL
  `);
}
