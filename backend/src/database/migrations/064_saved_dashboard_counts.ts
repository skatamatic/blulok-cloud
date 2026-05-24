import { Knex } from 'knex';

/**
 * Additive migration for DBs that already ran 063 before counts/constraints were added.
 */
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('saved_dashboards')) {
    const hasPageCount = await knex.schema.hasColumn('saved_dashboards', 'page_count');
    if (!hasPageCount) {
      await knex.schema.alterTable('saved_dashboards', (table) => {
        table.integer('page_count').notNullable().defaultTo(0);
        table.integer('widget_count').notNullable().defaultTo(0);
      });

      const rows = await knex('saved_dashboards').select('id', 'snapshot');
      for (const row of rows) {
        const counts = countSnapshotPagesAndWidgets(row.snapshot);
        await knex('saved_dashboards')
          .where('id', row.id)
          .update({ page_count: counts.pageCount, widget_count: counts.widgetCount });
      }
    }
  }

  if (await knex.schema.hasTable('dashboard_assignments')) {
    const [checkRows] = await knex.raw(`
      SELECT CONSTRAINT_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'dashboard_assignments'
        AND CONSTRAINT_NAME = 'chk_dashboard_assignment_scope'
    `);

    if (!(checkRows as unknown[]).length) {
      await knex.raw(`
        ALTER TABLE dashboard_assignments
        ADD CONSTRAINT chk_dashboard_assignment_scope CHECK (
          (scope = 'global' AND facility_id IS NULL AND user_id IS NULL) OR
          (scope = 'facility' AND facility_id IS NOT NULL AND user_id IS NULL) OR
          (scope = 'user' AND user_id IS NOT NULL AND facility_id IS NULL)
        )
      `);
    }

    const hasScopeEntity = await knex.schema.hasColumn(
      'dashboard_assignments',
      'scope_entity_id'
    );
    if (!hasScopeEntity) {
      // Use a regular column + backfill instead of a STORED generated column.
      // MySQL can reject generated columns on tables with existing FK constraints (errno 1215).
      await knex.schema.alterTable('dashboard_assignments', (table) => {
        table.specificType('scope_entity_id', 'CHAR(36)').nullable();
      });

      await knex.raw(`
        UPDATE dashboard_assignments
        SET scope_entity_id = CASE
          WHEN scope = 'user' THEN user_id
          WHEN scope = 'facility' THEN facility_id
          ELSE '00000000-0000-0000-0000-000000000000'
        END
      `);

      await knex.raw(`
        ALTER TABLE dashboard_assignments
        MODIFY COLUMN scope_entity_id CHAR(36) NOT NULL
      `);

      const [indexRows] = await knex.raw(`
        SELECT INDEX_NAME
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'dashboard_assignments'
          AND INDEX_NAME = 'uniq_dashboard_assignment'
      `);

      if (!(indexRows as unknown[]).length) {
        await knex.raw(`
          ALTER TABLE dashboard_assignments
          ADD UNIQUE KEY uniq_dashboard_assignment (
            saved_dashboard_id,
            target_role,
            scope,
            scope_entity_id
          )
        `);
      }
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('dashboard_assignments')) {
    const hasScopeEntity = await knex.schema.hasColumn(
      'dashboard_assignments',
      'scope_entity_id'
    );
    if (hasScopeEntity) {
      await knex.raw(
        'ALTER TABLE dashboard_assignments DROP INDEX uniq_dashboard_assignment'
      );
      await knex.schema.alterTable('dashboard_assignments', (table) => {
        table.dropColumn('scope_entity_id');
      });
    }

    await knex.raw(
      'ALTER TABLE dashboard_assignments DROP CHECK chk_dashboard_assignment_scope'
    ).catch(() => undefined);
  }

  if (await knex.schema.hasTable('saved_dashboards')) {
    const hasPageCount = await knex.schema.hasColumn('saved_dashboards', 'page_count');
    if (hasPageCount) {
      await knex.schema.alterTable('saved_dashboards', (table) => {
        table.dropColumn('page_count');
        table.dropColumn('widget_count');
      });
    }
  }
}

function countSnapshotPagesAndWidgets(snapshot: unknown): {
  pageCount: number;
  widgetCount: number;
} {
  try {
    const parsed = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
    const pages = (parsed as { pages?: unknown[] })?.pages;
    if (!Array.isArray(pages)) {
      return { pageCount: 0, widgetCount: 0 };
    }
    const widgetCount = pages.reduce((sum: number, page) => {
      const widgets = (page as { widgets?: unknown[] })?.widgets;
      return sum + (Array.isArray(widgets) ? widgets.length : 0);
    }, 0);
    return { pageCount: pages.length, widgetCount };
  } catch {
    return { pageCount: 0, widgetCount: 0 };
  }
}
