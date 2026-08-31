import { Knex } from 'knex';
import { IN_APP_NOTIFICATION_TYPES } from '@/constants/in-app-notification.constants';

/**
 * Add fms_webhook_received notification type and persist webhook event summaries for UI feed.
 */
export async function up(knex: Knex): Promise<void> {
  const enumValues = IN_APP_NOTIFICATION_TYPES.map((v) => `'${v}'`).join(', ');
  await knex.raw(`
    ALTER TABLE notifications
    MODIFY COLUMN notification_type ENUM(${enumValues}) NOT NULL
  `);

  const hasColumn = await knex.schema.hasColumn('fms_webhook_events', 'event_summary');
  if (!hasColumn) {
    await knex.schema.alterTable('fms_webhook_events', (table) => {
      table.json('event_summary').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('fms_webhook_events', 'event_summary');
  if (hasColumn) {
    await knex.schema.alterTable('fms_webhook_events', (table) => {
      table.dropColumn('event_summary');
    });
  }

  const withoutNewType = IN_APP_NOTIFICATION_TYPES.filter((t) => t !== 'fms_webhook_received');
  const enumValues = withoutNewType.map((v) => `'${v}'`).join(', ');
  await knex.raw(`
    ALTER TABLE notifications
    MODIFY COLUMN notification_type ENUM(${enumValues}) NOT NULL
  `);
}
