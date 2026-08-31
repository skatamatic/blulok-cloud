import { Knex } from 'knex';
import { randomUUID } from 'crypto';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('user_dashboard_pages'))) {
    await knex.schema.createTable('user_dashboard_pages', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      table.uuid('user_id').notNullable();
      table.string('name', 100).notNullable().defaultTo('Main');
      table.integer('page_order').notNullable().defaultTo(0);
      table.timestamps(true, true);

      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.index(['user_id']);
      table.index(['user_id', 'page_order']);
    });
  }

  const hasPageId = await knex.schema.hasColumn('user_widget_layouts', 'page_id');
  if (!hasPageId) {
    await knex.schema.alterTable('user_widget_layouts', (table) => {
      table.uuid('page_id').nullable();
    });
  }

  // Backfill page_id for every widget row (visible and hidden)
  const userIdsWithOrphanWidgets = await knex('user_widget_layouts')
    .distinct('user_id')
    .whereNull('page_id')
    .pluck('user_id');

  for (const userId of userIdsWithOrphanWidgets) {
    let page = await knex('user_dashboard_pages')
      .where('user_id', userId)
      .orderBy('page_order', 'asc')
      .first();

    if (!page) {
      const pageId = randomUUID();
      await knex('user_dashboard_pages').insert({
        id: pageId,
        user_id: userId,
        name: 'Main',
        page_order: 0,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });
      page = { id: pageId };
    }

    await knex('user_widget_layouts')
      .where('user_id', userId)
      .whereNull('page_id')
      .update({ page_id: page.id });
  }

  const remainingNull = await knex('user_widget_layouts')
    .whereNull('page_id')
    .count('* as count')
    .first();
  const nullCount = Number(remainingNull?.count ?? 0);
  if (nullCount > 0) {
    throw new Error(
      `Migration 062: ${nullCount} widget layout rows still have null page_id after backfill`
    );
  }

  const hasOldUnique = await knex.schema.hasTable('user_widget_layouts');
  if (hasOldUnique) {
    try {
      await knex.schema.alterTable('user_widget_layouts', (table) => {
        table.dropUnique(['user_id', 'widget_id'], 'unique_user_widget');
      });
    } catch {
      try {
        await knex.raw(
          'ALTER TABLE user_widget_layouts DROP INDEX unique_user_widget'
        );
      } catch {
        // ignore if already dropped
      }
    }

    await knex.schema.alterTable('user_widget_layouts', (table) => {
      table.uuid('page_id').notNullable().alter();
      table
        .foreign('page_id')
        .references('id')
        .inTable('user_dashboard_pages')
        .onDelete('CASCADE');
      table.unique(['user_id', 'page_id', 'widget_id'], 'unique_user_page_widget');
      table.index(
        ['user_id', 'page_id', 'display_order'],
        'idx_user_page_display_order'
      );
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('user_widget_layouts')) {
    try {
      await knex.schema.alterTable('user_widget_layouts', (table) => {
        table.dropUnique(['user_id', 'page_id', 'widget_id'], 'unique_user_page_widget');
        table.dropForeign(['page_id']);
        table.dropIndex(
          ['user_id', 'page_id', 'display_order'],
          'idx_user_page_display_order'
        );
      });
    } catch {
      // ignore
    }

    await knex.schema.alterTable('user_widget_layouts', (table) => {
      table.dropColumn('page_id');
      table.unique(['user_id', 'widget_id'], 'unique_user_widget');
    });
  }

  await knex.schema.dropTableIfExists('user_dashboard_pages');
}
