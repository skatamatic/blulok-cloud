import { Knex } from 'knex';

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Allow facility-scoped assignments with facility_id NULL (= all-facilities aggregate view).
 * Fix scope_entity_id to COALESCE null facility_id to zero UUID for unique index stability.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('dashboard_assignments'))) {
    return;
  }

  const [checkRows] = await knex.raw(`
    SELECT CONSTRAINT_NAME
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'dashboard_assignments'
      AND CONSTRAINT_NAME = 'chk_dashboard_assignment_scope'
  `);

  if ((checkRows as unknown[]).length) {
    await knex.raw(
      'ALTER TABLE dashboard_assignments DROP CHECK chk_dashboard_assignment_scope'
    );
  }

  await knex.raw(`
    ALTER TABLE dashboard_assignments
    ADD CONSTRAINT chk_dashboard_assignment_scope CHECK (
      (scope = 'global' AND facility_id IS NULL AND user_id IS NULL) OR
      (scope = 'facility' AND user_id IS NULL) OR
      (scope = 'user' AND user_id IS NOT NULL AND facility_id IS NULL)
    )
  `);

  const hasScopeEntity = await knex.schema.hasColumn(
    'dashboard_assignments',
    'scope_entity_id'
  );

  if (hasScopeEntity) {
    await knex.raw(`
      UPDATE dashboard_assignments
      SET scope_entity_id = CASE
        WHEN scope = 'user' THEN user_id
        WHEN scope = 'facility' THEN COALESCE(facility_id, '${ZERO_UUID}')
        ELSE '${ZERO_UUID}'
      END
      WHERE scope_entity_id IS NULL
         OR (scope = 'facility' AND facility_id IS NULL AND scope_entity_id != '${ZERO_UUID}')
    `).catch(() => undefined);
  }
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('dashboard_assignments'))) {
    return;
  }

  const [checkRows] = await knex.raw(`
    SELECT CONSTRAINT_NAME
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'dashboard_assignments'
      AND CONSTRAINT_NAME = 'chk_dashboard_assignment_scope'
  `);

  if ((checkRows as unknown[]).length) {
    await knex.raw(
      'ALTER TABLE dashboard_assignments DROP CHECK chk_dashboard_assignment_scope'
    );
  }

  await knex.raw(`
    ALTER TABLE dashboard_assignments
    ADD CONSTRAINT chk_dashboard_assignment_scope CHECK (
      (scope = 'global' AND facility_id IS NULL AND user_id IS NULL) OR
      (scope = 'facility' AND facility_id IS NOT NULL AND user_id IS NULL) OR
      (scope = 'user' AND user_id IS NOT NULL AND facility_id IS NULL)
    )
  `);
}
