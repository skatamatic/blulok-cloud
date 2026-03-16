import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('gateways');
  if (!hasTable) {
    return;
  }

  const columnInfo = await knex.raw(`
    SELECT IS_NULLABLE, COLUMN_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'gateways'
      AND COLUMN_NAME = 'facility_id'
  `);

  const row = (columnInfo as any)[0]?.[0];
  if (!row || row.IS_NULLABLE === 'YES') {
    return;
  }

  const fkInfo = await knex.raw(`
    SELECT CONSTRAINT_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'gateways'
      AND COLUMN_NAME = 'facility_id'
      AND REFERENCED_TABLE_NAME IS NOT NULL
  `);
  const fkName = (fkInfo as any)[0]?.[0]?.CONSTRAINT_NAME;
  if (fkName) {
    await knex.raw(`ALTER TABLE gateways DROP FOREIGN KEY ??`, [fkName]);
  }

  const columnType = row.COLUMN_TYPE || 'char(36)';
  await knex.raw(`
    ALTER TABLE gateways
    MODIFY COLUMN facility_id ${columnType} NULL
  `);

  await knex.raw(`
    ALTER TABLE gateways
    ADD CONSTRAINT gateways_facility_id_foreign
    FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE SET NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('gateways');
  if (!hasTable) {
    return;
  }

  const nullAssigned = await knex('gateways')
    .whereNull('facility_id')
    .count('* as count')
    .first();
  const nullCount = nullAssigned ? parseInt(String((nullAssigned as any).count), 10) : 0;
  if (nullCount > 0) {
    throw new Error(`Cannot rollback migration: ${nullCount} gateways are unassigned`);
  }

  const fkInfo = await knex.raw(`
    SELECT CONSTRAINT_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'gateways'
      AND COLUMN_NAME = 'facility_id'
      AND REFERENCED_TABLE_NAME IS NOT NULL
  `);
  const fkName = (fkInfo as any)[0]?.[0]?.CONSTRAINT_NAME;
  if (fkName) {
    await knex.raw(`ALTER TABLE gateways DROP FOREIGN KEY ??`, [fkName]);
  }

  const typeInfo = await knex.raw(`
    SELECT COLUMN_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'gateways'
      AND COLUMN_NAME = 'facility_id'
  `);
  const columnType = (typeInfo as any)[0]?.[0]?.COLUMN_TYPE || 'char(36)';

  await knex.raw(`
    ALTER TABLE gateways
    MODIFY COLUMN facility_id ${columnType} NOT NULL
  `);

  await knex.raw(`
    ALTER TABLE gateways
    ADD CONSTRAINT gateways_facility_id_foreign
    FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE
  `);
}
