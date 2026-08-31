/**
 * BluDesign Asset Materials Migration
 * 
 * Adds tables for material presets and custom 3D models.
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ========================================================================
  // bludesign_material_presets - State-based material configurations
  // ========================================================================
  if (!(await knex.schema.hasTable('bludesign_material_presets'))) {
    await knex.schema.createTable('bludesign_material_presets', (table) => {
      table.uuid('id').primary().defaultTo(knex.fn.uuid());
      table.uuid('asset_id').notNullable();
      table.foreign('asset_id').references('id').inTable('bludesign_assets').onDelete('CASCADE');
      
      // Preset name (e.g., "default", "locked", "unlocked", "error", "custom1")
      table.string('preset_name', 100).notNullable();
      
      // Which part of the asset this applies to (e.g., "body", "door", "frame", "indicator")
      table.string('part_name', 100).notNullable();
      
      // Material configuration
      // { color: "#ffffff", metalness: 0.5, roughness: 0.5, emissive: "#000000", emissiveIntensity: 0 }
      table.json('material_config').notNullable();
      
      // Optional texture reference
      table.uuid('texture_id').nullable();
      table.foreign('texture_id').references('id').inTable('bludesign_asset_textures').onDelete('SET NULL');
      
      // For smart assets: which device state triggers this preset
      // null = default material, "locked" / "unlocked" / "error" / "unknown" for state-based
      table.string('state_binding', 50).nullable();
      
      // Sorting order for UI
      table.integer('sort_order').unsigned().notNullable().defaultTo(0);
      
      // Timestamps
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index('asset_id');
      table.index(['asset_id', 'preset_name']);
      table.index(['asset_id', 'state_binding']);
      table.unique(['asset_id', 'preset_name', 'part_name']);
    });
  }

  // ========================================================================
  // bludesign_custom_models - Uploaded 3D model files
  // ========================================================================
  if (!(await knex.schema.hasTable('bludesign_custom_models'))) {
    await knex.schema.createTable('bludesign_custom_models', (table) => {
      table.uuid('id').primary().defaultTo(knex.fn.uuid());
      table.uuid('project_id').notNullable();
      table.foreign('project_id').references('id').inTable('bludesign_projects').onDelete('CASCADE');
      
      table.string('name', 255).notNullable();
      table.text('description').nullable();
      
      // File information
      table.string('filename', 255).notNullable();
      table.string('content_type', 100).notNullable();
      table.integer('file_size').unsigned().notNullable();
      
      // Storage location (relative path or external URL)
      table.string('storage_path', 512).notNullable();
      
      // Model format
      table.enum('format', ['gltf', 'glb', 'fbx', 'obj']).notNullable();
      
      // Model metadata (bounding box, polygon count, etc.)
      table.json('model_metadata').nullable();
      
      // Thumbnail (base64 data URI or file reference)
      table.text('thumbnail').nullable();
      
      // Categories for organization
      table.json('tags').nullable();
      
      // Audit fields
      table.uuid('uploaded_by').nullable();
      table.foreign('uploaded_by').references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('uploaded_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index('project_id');
      table.index('format');
      table.index(['project_id', 'name']);
    });
  }

  // ========================================================================
  // bludesign_asset_definitions - Global asset library (shared across projects)
  // ========================================================================
  if (!(await knex.schema.hasTable('bludesign_asset_definitions'))) {
    await knex.schema.createTable('bludesign_asset_definitions', (table) => {
      table.uuid('id').primary().defaultTo(knex.fn.uuid());
      
      table.string('name', 255).notNullable();
      table.text('description').nullable();
      
      // Asset classification
      table.enum('category', [
        'storage_unit', 'gate', 'elevator', 'access_control',
        'wall', 'floor', 'ceiling', 'stairwell', 'door',
        'pavement', 'grass', 'gravel', 'fence',
        'marker', 'label'
      ]).notNullable();
      
      // Model type
      table.enum('model_type', ['primitive', 'gltf', 'glb', 'custom']).notNullable().defaultTo('primitive');
      
      // Reference to custom model (if model_type is 'custom' or 'gltf'/'glb')
      table.uuid('custom_model_id').nullable();
      table.foreign('custom_model_id').references('id').inTable('bludesign_custom_models').onDelete('SET NULL');
      
      // Primitive specification (if model_type is 'primitive')
      // { type: "box", params: { width: 2, height: 3, depth: 2 } }
      table.json('primitive_spec').nullable();
      
      // Dimensions
      table.json('dimensions').notNullable();
      
      // Grid units
      table.json('grid_units').notNullable();
      
      // Behavior flags
      table.boolean('is_smart').notNullable().defaultTo(false);
      table.boolean('can_rotate').notNullable().defaultTo(true);
      table.boolean('can_stack').notNullable().defaultTo(false);
      
      // Smart asset binding contract
      table.json('binding_contract').nullable();
      
      // Default materials configuration
      table.json('default_materials').nullable();
      
      // Is this a built-in asset?
      table.boolean('is_builtin').notNullable().defaultTo(false);
      
      // Thumbnail (base64 data URI)
      table.text('thumbnail').nullable();
      
      // Audit fields
      table.uuid('created_by').nullable();
      table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index('category');
      table.index('is_smart');
      table.index('is_builtin');
      table.index('model_type');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('bludesign_asset_definitions');
  await knex.schema.dropTableIfExists('bludesign_custom_models');
  await knex.schema.dropTableIfExists('bludesign_material_presets');
}



