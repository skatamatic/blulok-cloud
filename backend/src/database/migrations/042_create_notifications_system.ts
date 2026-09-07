import { Knex } from 'knex';

/**
 * Create notifications system table
 * 
 * Implements a flexible notification system with read receipt support.
 * Notifications are role-specific and support various types including:
 * - Access grants/denials
 * - Device registrations
 * - Password resets
 * - System alerts
 * 
 * Tables created:
 * - notifications: User notifications with read receipt tracking
 */
export async function up(knex: Knex): Promise<void> {
  // Create notifications table
  const hasNotificationsTable = await knex.schema.hasTable('notifications');
  if (!hasNotificationsTable) {
    await knex.schema.createTable('notifications', (table) => {
      table.string('id', 36).primary();
      
      // Target user for the notification
      table.string('user_id', 36).notNullable();
      
      // Notification type for filtering and display
      table.enum('notification_type', [
        'access_granted',
        'access_denied',
        'device_registered',
        'password_reset',
        'unit_assigned',
        'unit_unassigned',
        'system_alert',
        'maintenance_alert',
        'security_alert',
        'general'
      ]).notNullable();
      
      // Notification content
      table.string('title', 255).notNullable();
      table.text('message').notNullable();
      
      // Severity/priority for UI treatment
      table.enum('priority', ['low', 'normal', 'high', 'urgent']).defaultTo('normal');
      
      // Read receipt support
      table.boolean('is_read').defaultTo(false);
      table.datetime('read_at').nullable();
      
      // Optional reference to related entities
      table.string('reference_type', 50).nullable().comment('Type of related entity (unit, device, facility, etc.)');
      table.string('reference_id', 36).nullable().comment('ID of related entity');
      
      // Optional facility scoping
      table.string('facility_id', 36).nullable();
      
      // Metadata for extensibility
      table.json('metadata').nullable();
      
      // Expiration for auto-cleanup
      table.datetime('expires_at').nullable();
      
      // Soft delete support
      table.boolean('is_deleted').defaultTo(false);
      
      // Timestamps
      table.timestamps(true, true);

      // Foreign keys
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.foreign('facility_id').references('id').inTable('facilities').onDelete('SET NULL');

      // Indexes for common queries
      table.index(['user_id', 'is_read', 'is_deleted'], 'idx_notifications_user_unread');
      table.index(['user_id', 'notification_type'], 'idx_notifications_user_type');
      table.index(['user_id', 'created_at'], 'idx_notifications_user_created');
      table.index(['facility_id'], 'idx_notifications_facility');
      table.index(['expires_at'], 'idx_notifications_expires');
      table.index(['reference_type', 'reference_id'], 'idx_notifications_reference');
    });
    console.log('Created notifications table');
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasNotificationsTable = await knex.schema.hasTable('notifications');
  if (hasNotificationsTable) {
    await knex.schema.dropTableIfExists('notifications');
    console.log('Dropped notifications table');
  }
}
