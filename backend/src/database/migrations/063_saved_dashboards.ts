import { Knex } from 'knex';

const USER_ROLES = [
  'tenant',
  'admin',
  'facility_admin',
  'maintenance',
  'blulok_technician',
  'dev_admin',
] as const;

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('saved_dashboards'))) {
    await knex.schema.createTable('saved_dashboards', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      table.string('name', 100).notNullable().unique();
      table.text('description').nullable();
      table.json('snapshot').notNullable();
      table.integer('page_count').notNullable().defaultTo(0);
      table.integer('widget_count').notNullable().defaultTo(0);
      table.uuid('created_by').notNullable();
      table.uuid('updated_by').notNullable();
      table.timestamps(true, true);

      table.foreign('created_by').references('id').inTable('users').onDelete('RESTRICT');
      table.foreign('updated_by').references('id').inTable('users').onDelete('RESTRICT');
      table.index(['name']);
      table.index(['created_by']);
      table.index(['updated_at']);
    });
  }

  if (!(await knex.schema.hasTable('dashboard_assignments'))) {
    await knex.schema.createTable('dashboard_assignments', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      table.uuid('saved_dashboard_id').notNullable();
      table.enum('scope', ['global', 'facility', 'user']).notNullable();
      table.uuid('facility_id').nullable();
      table.uuid('user_id').nullable();
      table.enum('target_role', [...USER_ROLES]).notNullable();
      table.integer('priority').notNullable().defaultTo(0);
      table.uuid('created_by').notNullable();
      table.timestamps(true, true);

      table
        .foreign('saved_dashboard_id')
        .references('id')
        .inTable('saved_dashboards')
        .onDelete('CASCADE');
      table.foreign('facility_id').references('id').inTable('facilities').onDelete('CASCADE');
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.foreign('created_by').references('id').inTable('users').onDelete('RESTRICT');

      table.index(['scope', 'target_role']);
      table.index(['user_id', 'target_role']);
      table.index(['facility_id', 'target_role']);
      table.index(['saved_dashboard_id']);
    });

    await knex.raw(`
      ALTER TABLE dashboard_assignments
      ADD CONSTRAINT chk_dashboard_assignment_scope CHECK (
        (scope = 'global' AND facility_id IS NULL AND user_id IS NULL) OR
        (scope = 'facility' AND facility_id IS NOT NULL AND user_id IS NULL) OR
        (scope = 'user' AND user_id IS NOT NULL AND facility_id IS NULL)
      )
    `);

    await knex.raw(`
      ALTER TABLE dashboard_assignments
      ADD COLUMN scope_entity_id CHAR(36) AS (
        CASE
          WHEN scope = 'user' THEN user_id
          WHEN scope = 'facility' THEN facility_id
          ELSE '00000000-0000-0000-0000-000000000000'
        END
      ) STORED
    `);

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

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('dashboard_assignments');
  await knex.schema.dropTableIfExists('saved_dashboards');
}
