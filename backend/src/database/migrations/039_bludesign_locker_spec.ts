/**
 * Migration: Add locker_spec column to bludesign_asset_definitions
 * 
 * Stores storage locker configuration:
 * - doorSide: which side the door is on (front, back, left, right)
 * - doorWidth: width of the door in meters
 * - doorHeight: height of the door in meters
 * - doorPositionX: horizontal offset from center in meters
 * - doorPositionY: vertical offset from bottom in meters
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add locker_spec JSON column to bludesign_asset_definitions
  await knex.schema.alterTable('bludesign_asset_definitions', (table) => {
    table.json('locker_spec').nullable().after('default_materials');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('bludesign_asset_definitions', (table) => {
    table.dropColumn('locker_spec');
  });
}

