import { Knex } from 'knex';

/**
 * Track how many saved BluDesign facilities reference each asset definition.
 */
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(
    'bludesign_asset_definitions',
    'facility_usage_count'
  );
  if (!hasColumn) {
    await knex.schema.alterTable('bludesign_asset_definitions', (table) => {
      table.integer('facility_usage_count').notNullable().defaultTo(0);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(
    'bludesign_asset_definitions',
    'facility_usage_count'
  );
  if (hasColumn) {
    await knex.schema.alterTable('bludesign_asset_definitions', (table) => {
      table.dropColumn('facility_usage_count');
    });
  }
}
