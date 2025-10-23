import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add unique constraint to enforce 1:1 mapping per (facility_id, entity_type) -> internal_id
  const hasTable = await knex.schema.hasTable('fms_entity_mappings');
  if (!hasTable) return;

  // 1) Prefer mappings whose metadata.unitNumber matches the actual unit's unit_number
  //    Remove mismatched ones to eliminate many->one duplicates created by earlier bugs
  //    Safe for MySQL JSON columns using JSON_EXTRACT
  await knex.raw(`
    DELETE fem FROM fms_entity_mappings fem
    JOIN units u ON u.id = fem.internal_id
    WHERE fem.entity_type = 'unit'
      AND fem.facility_id = u.facility_id
      AND JSON_EXTRACT(fem.metadata, '$.unitNumber') IS NOT NULL
      AND JSON_UNQUOTE(JSON_EXTRACT(fem.metadata, '$.unitNumber')) <> u.unit_number;
  `);

  // 2) For any remaining duplicates per (facility_id, entity_type, internal_id), keep one and drop the rest
  await knex.raw(`
    DELETE fem FROM fms_entity_mappings fem
    JOIN (
      SELECT facility_id, entity_type, internal_id, MIN(id) AS keep_id, COUNT(*) AS cnt
      FROM fms_entity_mappings
      GROUP BY facility_id, entity_type, internal_id
      HAVING cnt > 1
    ) d ON d.facility_id = fem.facility_id AND d.entity_type = fem.entity_type AND d.internal_id = fem.internal_id
    WHERE fem.id <> d.keep_id;
  `);

  // MySQL requires explicit index names for later drop
  await knex.schema.alterTable('fms_entity_mappings', (table) => {
    table.unique(['facility_id', 'entity_type', 'internal_id'], 'fms_mappings_facility_entity_internal_unique');
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('fms_entity_mappings');
  if (!hasTable) return;

  await knex.schema.alterTable('fms_entity_mappings', (table) => {
    table.dropUnique(['facility_id', 'entity_type', 'internal_id'], 'fms_mappings_facility_entity_internal_unique');
  });
}


