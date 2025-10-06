import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create user_widget_layouts table
  if (!(await knex.schema.hasTable('user_widget_layouts'))) {
    await knex.schema.createTable('user_widget_layouts', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      table.uuid('user_id').notNullable();
      table.string('widget_id', 100).notNullable(); // Unique identifier for widget type
      table.string('widget_type', 50).notNullable(); // stats, activity, status, etc.
      table.json('layout_config').notNullable(); // Position, size, and widget-specific config
      table.boolean('is_visible').notNullable().defaultTo(true);
      table.integer('display_order').notNullable().defaultTo(0);
      table.timestamps(true, true);
      
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
      
      // Ensure unique widget per user
      table.unique(['user_id', 'widget_id'], 'unique_user_widget');
      
      table.index(['user_id']);
      table.index(['widget_type']);
      table.index(['is_visible']);
      table.index(['display_order']);
    });
  }

  // Create default_widget_templates table for system-wide widget definitions
  if (!(await knex.schema.hasTable('default_widget_templates'))) {
    await knex.schema.createTable('default_widget_templates', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      table.string('widget_id', 100).notNullable().unique();
      table.string('widget_type', 50).notNullable();
      table.string('name', 255).notNullable();
      table.text('description').nullable();
      table.json('default_config').notNullable(); // Default position, size, and settings
      table.json('available_sizes').notNullable(); // Array of available sizes
      table.json('required_permissions').nullable(); // Roles/permissions needed to see widget
      table.boolean('is_active').notNullable().defaultTo(true);
      table.integer('default_order').notNullable().defaultTo(0);
      table.timestamps(true, true);
      
      table.index(['widget_type']);
      table.index(['is_active']);
      table.index(['default_order']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_widget_layouts');
  await knex.schema.dropTableIfExists('default_widget_templates');
}
