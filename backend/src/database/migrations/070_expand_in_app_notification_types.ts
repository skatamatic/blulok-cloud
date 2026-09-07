import type { Knex } from 'knex';
import { IN_APP_NOTIFICATION_TYPES } from '@/constants/in-app-notification.constants';

/**
 * Expand notifications.notification_type enum for operational alerts.
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

  const legacy = [
    'access_granted',
    'access_denied',
    'device_registered',
    'password_reset',
    'unit_assigned',
    'unit_unassigned',
    'system_alert',
    'maintenance_alert',
    'security_alert',
    'general',
  ] as const;

  await knex('notifications')
    .whereNotIn('notification_type', legacy as unknown as string[])
    .update({ notification_type: 'general' });

  const enumValues = legacy.map((v) => `'${v}'`).join(', ');
  await knex.raw(`
    ALTER TABLE notifications
    MODIFY COLUMN notification_type ENUM(${enumValues}) NOT NULL
  `);
}
