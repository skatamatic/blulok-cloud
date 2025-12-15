/**
 * Migration: BluDesign Themes and Skins Tables
 * 
 * Creates tables for storing custom themes and skins for BluDesign.
 * Themes are bundles of skins applied to asset categories.
 * Skins define materials for asset parts.
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create bludesign_themes table
  await knex.schema.createTable('bludesign_themes', (table) => {
    table.string('id', 100).primary();
    table.uuid('user_id').notNullable();
    table.string('name', 100).notNullable();
    table.string('description', 500).nullable();
    table.text('category_skins').nullable(); // JSON: Record<AssetCategory, skinId>
    table.string('building_skin', 50).defaultTo('DEFAULT'); // BuildingSkinType enum
    table.string('building_skin_id', 100).nullable(); // Reference to custom building skin
    table.text('environment').nullable(); // JSON: { grass, pavement, gravel }
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Foreign key to users table
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    
    // Indexes
    table.index(['user_id']);
  });

  // Create bludesign_skins table
  await knex.schema.createTable('bludesign_skins', (table) => {
    table.string('id', 100).primary();
    table.uuid('user_id').notNullable();
    table.string('name', 100).notNullable();
    table.string('description', 500).nullable();
    table.string('category', 50).notNullable(); // AssetCategory enum
    table.text('part_materials').notNullable(); // JSON: Record<partName, PartMaterial>
    table.text('thumbnail').nullable(); // Base64 or URL
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Foreign key to users table
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    
    // Indexes
    table.index(['user_id']);
    table.index(['category']);
    table.index(['user_id', 'category']);
  });

  console.log('✅ Created bludesign_themes and bludesign_skins tables');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('bludesign_skins');
  await knex.schema.dropTableIfExists('bludesign_themes');
  
  console.log('✅ Dropped bludesign_themes and bludesign_skins tables');
}

