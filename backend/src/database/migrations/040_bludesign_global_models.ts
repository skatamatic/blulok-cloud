/**
 * Migration: BluDesign Global Models
 * 
 * Creates:
 * - bludesign_global_models table for globally shared custom 3D models
 * - Adds global_model_id and position_offset columns to bludesign_asset_definitions
 * 
 * Global models are not tied to any specific project and can be used across all facilities.
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ========================================================================
  // bludesign_global_models - Globally shared custom 3D models
  // ========================================================================
  if (!(await knex.schema.hasTable('bludesign_global_models'))) {
    await knex.schema.createTable('bludesign_global_models', (table) => {
      table.uuid('id').primary().defaultTo(knex.fn.uuid());
      
      // Model metadata
      table.string('name', 255).notNullable();
      table.text('description').nullable();
      table.string('filename', 255).notNullable();
      table.string('content_type', 100).notNullable();
      table.integer('file_size').unsigned().notNullable();
      
      // Storage information
      table.string('storage_path', 500).notNullable();
      
      // Model format (gltf, glb, fbx, obj)
      table.string('format', 10).notNullable();
      
      // Optional metadata (bounding box, vertex count, etc.)
      table.json('model_metadata').nullable();
      
      // Optional thumbnail (base64 data URL)
      table.text('thumbnail').nullable();
      
      // Optional tags for organization
      table.json('tags').nullable();
      
      // Tracking
      table.uuid('uploaded_by').nullable();
      table.timestamp('uploaded_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index('name');
      table.index('format');
      table.index('uploaded_by');
    });
  }

  // ========================================================================
  // Update bludesign_asset_definitions
  // ========================================================================
  await knex.schema.alterTable('bludesign_asset_definitions', (table) => {
    // Reference to global model (alternative to project-scoped custom_model_id)
    table.uuid('global_model_id').nullable().after('custom_model_id');
    table.foreign('global_model_id').references('id').inTable('bludesign_global_models').onDelete('SET NULL');
    
    // Position offset for custom models (stores {x, y, z} in meters)
    // Used to properly position uploaded models on the grid
    table.json('position_offset').nullable().after('locker_spec');
  });
}

export async function down(knex: Knex): Promise<void> {
  // Remove columns from bludesign_asset_definitions
  await knex.schema.alterTable('bludesign_asset_definitions', (table) => {
    table.dropColumn('position_offset');
    table.dropForeign(['global_model_id']);
    table.dropColumn('global_model_id');
  });

  // Drop bludesign_global_models table
  await knex.schema.dropTableIfExists('bludesign_global_models');
}
