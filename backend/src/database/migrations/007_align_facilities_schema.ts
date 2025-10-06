import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add status column to facilities table if it doesn't exist
  if (await knex.schema.hasTable('facilities')) {
    if (!(await knex.schema.hasColumn('facilities', 'status'))) {
      await knex.schema.alterTable('facilities', (table) => {
        table.enum('status', ['active', 'inactive', 'maintenance']).defaultTo('active');
      });
      
      // Migrate existing is_active values to status
      if (await knex.schema.hasColumn('facilities', 'is_active')) {
        await knex.raw(`
          UPDATE facilities 
          SET status = CASE 
            WHEN is_active = 1 THEN 'active' 
            ELSE 'inactive' 
          END
        `);
      }
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // Remove status column if it exists
  if (await knex.schema.hasTable('facilities')) {
    if (await knex.schema.hasColumn('facilities', 'status')) {
      await knex.schema.alterTable('facilities', (table) => {
        table.dropColumn('status');
      });
    }
  }
}

