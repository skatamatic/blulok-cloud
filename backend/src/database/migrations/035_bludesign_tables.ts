/**
 * BluDesign Tables Migration
 * 
 * Creates tables for the BluDesign 3D facility design system.
 * Fully isolated from existing BluLok tables.
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ========================================================================
  // bludesign_projects - Multi-tenant project containers
  // ========================================================================
  if (!(await knex.schema.hasTable('bludesign_projects'))) {
    await knex.schema.createTable('bludesign_projects', (table) => {
      table.uuid('id').primary().defaultTo(knex.fn.uuid());
      table.string('name', 255).notNullable();
      table.text('description').nullable();
      
      // Owner (references users table)
      table.uuid('owner_id').notNullable();
      table.foreign('owner_id').references('id').inTable('users').onDelete('CASCADE');
      
      // Storage configuration
      table.enum('storage_provider', ['local', 'gcs', 'gdrive']).notNullable().defaultTo('local');
      table.json('storage_config').nullable();
      
      // Default branding for all facilities in project
      table.json('default_branding').nullable();
      
      // Timestamps
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index('owner_id');
      table.index('created_at');
    });
  }

  // ========================================================================
  // bludesign_assets - Asset metadata (files stored in external storage)
  // ========================================================================
  if (!(await knex.schema.hasTable('bludesign_assets'))) {
    await knex.schema.createTable('bludesign_assets', (table) => {
      table.uuid('id').primary().defaultTo(knex.fn.uuid());
      table.uuid('project_id').notNullable();
      table.foreign('project_id').references('id').inTable('bludesign_projects').onDelete('CASCADE');
      
      table.string('name', 255).notNullable();
      table.string('version', 50).notNullable().defaultTo('1.0.0');
      
      // Asset classification
      table.enum('category', [
        'storage_unit', 'gate', 'elevator', 'access_control',
        'wall', 'floor', 'ceiling', 'stairwell', 'door',
        'pavement', 'grass', 'gravel', 'fence',
        'marker', 'label'
      ]).notNullable();
      
      // Geometry definition
      table.enum('geometry_type', ['primitive', 'gltf', 'glb', 'fbx']).notNullable();
      table.string('geometry_source', 512).nullable(); // File path/URL for external files
      table.json('primitive_spec').nullable(); // For primitive-based assets
      
      // Materials configuration
      table.json('materials').nullable();
      
      // Smart asset binding contract
      table.boolean('is_smart').notNullable().defaultTo(false);
      table.json('binding_contract').nullable();
      
      // Asset metadata (dimensions, grid units, etc.)
      table.json('metadata').notNullable();
      
      // Audit fields
      table.uuid('created_by').nullable();
      table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index('project_id');
      table.index('category');
      table.index('is_smart');
      table.index(['project_id', 'name']);
    });
  }

  // ========================================================================
  // bludesign_facilities - Facility metadata
  // ========================================================================
  if (!(await knex.schema.hasTable('bludesign_facilities'))) {
    await knex.schema.createTable('bludesign_facilities', (table) => {
      table.uuid('id').primary().defaultTo(knex.fn.uuid());
      table.uuid('project_id').notNullable();
      table.foreign('project_id').references('id').inTable('bludesign_projects').onDelete('CASCADE');
      
      table.string('name', 255).notNullable();
      table.text('description').nullable();
      table.string('version', 50).notNullable().defaultTo('1.0.0');
      
      // Asset manifest - list of asset IDs used
      table.json('asset_manifest').notNullable();
      
      // Placed objects with transforms and bindings
      table.json('objects').notNullable();
      
      // Scene settings (lighting, grid, background)
      table.json('settings').notNullable();
      
      // Facility-specific branding overrides
      table.json('branding_config').nullable();
      
      // Optional link to actual BluLok facility for smart binding
      table.uuid('linked_facility_id').nullable();
      table.foreign('linked_facility_id').references('id').inTable('facilities').onDelete('SET NULL');
      
      // Audit fields
      table.uuid('created_by').nullable();
      table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index('project_id');
      table.index('linked_facility_id');
      table.index(['project_id', 'name']);
    });
  }

  // ========================================================================
  // bludesign_storage_configs - Per-user storage provider settings
  // ========================================================================
  if (!(await knex.schema.hasTable('bludesign_storage_configs'))) {
    await knex.schema.createTable('bludesign_storage_configs', (table) => {
      table.uuid('id').primary().defaultTo(knex.fn.uuid());
      table.uuid('user_id').notNullable();
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
      
      table.enum('provider_type', ['local', 'gcs', 'gdrive']).notNullable();
      
      // Encrypted credentials (provider-specific)
      table.text('credentials_encrypted').nullable();
      
      // Display name for this config
      table.string('display_name', 255).nullable();
      
      // Is this the user's default storage?
      table.boolean('is_default').notNullable().defaultTo(false);
      
      // Timestamps
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index('user_id');
      table.unique(['user_id', 'provider_type', 'display_name'], 'unique_user_provider_display_name');
    });
  }

  // ========================================================================
  // bludesign_asset_textures - Track textures for assets
  // ========================================================================
  if (!(await knex.schema.hasTable('bludesign_asset_textures'))) {
    await knex.schema.createTable('bludesign_asset_textures', (table) => {
      table.uuid('id').primary().defaultTo(knex.fn.uuid());
      table.uuid('asset_id').notNullable();
      table.foreign('asset_id').references('id').inTable('bludesign_assets').onDelete('CASCADE');
      
      table.string('slot_name', 100).notNullable();
      table.string('filename', 255).notNullable();
      table.string('content_type', 100).notNullable();
      table.integer('file_size').unsigned().notNullable();
      table.string('storage_path', 512).notNullable();
      
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index('asset_id');
      table.unique(['asset_id', 'slot_name']);
    });
  }

  // ========================================================================
  // bludesign_facility_snapshots - Version history for facilities
  // ========================================================================
  if (!(await knex.schema.hasTable('bludesign_facility_snapshots'))) {
    await knex.schema.createTable('bludesign_facility_snapshots', (table) => {
      table.uuid('id').primary().defaultTo(knex.fn.uuid());
      table.uuid('facility_id').notNullable();
      table.foreign('facility_id').references('id').inTable('bludesign_facilities').onDelete('CASCADE');
      
      table.string('version', 50).notNullable();
      table.string('label', 255).nullable(); // User-friendly label like "Before gate changes"
      
      // Full snapshot of facility state
      table.json('snapshot_data').notNullable();
      
      table.uuid('created_by').nullable();
      table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index('facility_id');
      table.index(['facility_id', 'version']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse order due to foreign key constraints
  await knex.schema.dropTableIfExists('bludesign_facility_snapshots');
  await knex.schema.dropTableIfExists('bludesign_asset_textures');
  await knex.schema.dropTableIfExists('bludesign_storage_configs');
  await knex.schema.dropTableIfExists('bludesign_facilities');
  await knex.schema.dropTableIfExists('bludesign_assets');
  await knex.schema.dropTableIfExists('bludesign_projects');
}

