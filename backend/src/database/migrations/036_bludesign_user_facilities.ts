/**
 * BluDesign User Facilities Migration
 * 
 * Creates user-specific facility table for quick save/load workflow.
 * Simpler than project-based system for individual user facilities.
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ========================================================================
  // bludesign_user_facilities - User-specific facilities for quick save/load
  // ========================================================================
  if (!(await knex.schema.hasTable('bludesign_user_facilities'))) {
    await knex.schema.createTable('bludesign_user_facilities', (table) => {
      table.uuid('id').primary().defaultTo(knex.fn.uuid());
      
      // Owner
      table.uuid('user_id').notNullable();
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
      
      // Facility info
      table.string('name', 255).notNullable();
      
      // Full scene data (camera, placed objects, grid settings, etc.)
      table.jsonb('data').notNullable();
      
      // Thumbnail (base64 encoded image or storage path)
      table.text('thumbnail').nullable();
      
      // Track last opened for auto-resume
      table.timestamp('last_opened').nullable();
      
      // Timestamps
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index('user_id');
      table.index(['user_id', 'last_opened']); // For finding last opened
      table.index(['user_id', 'updated_at']); // For sorting
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('bludesign_user_facilities');
}



