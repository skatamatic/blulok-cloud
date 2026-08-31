import { Knex } from 'knex';

/**
 * Non-loginable FMS tenants created without email/phone.
 * Durable FMS identity remains on fms_entity_mappings.external_id.
 */
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('users', 'is_placeholder');
  if (!hasColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.boolean('is_placeholder').notNullable().defaultTo(false);
      table.index(['is_placeholder'], 'idx_users_is_placeholder');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('users', 'is_placeholder');
  if (hasColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.dropIndex(['is_placeholder'], 'idx_users_is_placeholder');
      table.dropColumn('is_placeholder');
    });
  }
}
