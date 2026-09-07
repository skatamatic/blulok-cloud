/**
 * Migrate facility scene data from DB JSONB column to storage bucket.
 *
 * The `data` column previously held the full scene graph (camera, objects,
 * buildings, skins, grid).  This data now lives in the configured storage
 * provider at `bludesign/user-facilities/{userId}/{facilityId}/data.json`.
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('bludesign_user_facilities', 'data');
  if (hasColumn) {
    await knex.schema.alterTable('bludesign_user_facilities', (table) => {
      table.dropColumn('data');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('bludesign_user_facilities', 'data');
  if (!hasColumn) {
    await knex.schema.alterTable('bludesign_user_facilities', (table) => {
      table.jsonb('data').nullable();
    });
  }
}
