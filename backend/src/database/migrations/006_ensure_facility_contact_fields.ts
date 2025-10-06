import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Ensure contact fields exist in facilities table
  if (await knex.schema.hasTable('facilities')) {
    // Add contact_email if it doesn't exist
    if (!(await knex.schema.hasColumn('facilities', 'contact_email'))) {
      await knex.schema.alterTable('facilities', (table) => {
        table.string('contact_email', 255).nullable();
      });
    }

    // Add contact_phone if it doesn't exist
    if (!(await knex.schema.hasColumn('facilities', 'contact_phone'))) {
      await knex.schema.alterTable('facilities', (table) => {
        table.string('contact_phone', 50).nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // Rollback - remove contact fields
  if (await knex.schema.hasTable('facilities')) {
    if (await knex.schema.hasColumn('facilities', 'contact_email')) {
      await knex.schema.alterTable('facilities', (table) => {
        table.dropColumn('contact_email');
      });
    }

    if (await knex.schema.hasColumn('facilities', 'contact_phone')) {
      await knex.schema.alterTable('facilities', (table) => {
        table.dropColumn('contact_phone');
      });
    }
  }
}

