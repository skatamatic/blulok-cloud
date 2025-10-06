import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Check if facilities table exists and update branding column
  if (await knex.schema.hasTable('facilities')) {
    // Check if branding_image_url column exists and drop it
    if (await knex.schema.hasColumn('facilities', 'branding_image_url')) {
      await knex.schema.alterTable('facilities', (table) => {
        table.dropColumn('branding_image_url');
      });
    }

    // Add new branding_image column for base64 data
    if (!(await knex.schema.hasColumn('facilities', 'branding_image'))) {
      await knex.schema.alterTable('facilities', (table) => {
        table.text('branding_image', 'longtext').nullable();
      });
    }

    // Add image_mime_type column to store the original image type
    if (!(await knex.schema.hasColumn('facilities', 'image_mime_type'))) {
      await knex.schema.alterTable('facilities', (table) => {
        table.string('image_mime_type', 50).nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // Rollback changes
  if (await knex.schema.hasTable('facilities')) {
    // Drop new columns
    if (await knex.schema.hasColumn('facilities', 'branding_image')) {
      await knex.schema.alterTable('facilities', (table) => {
        table.dropColumn('branding_image');
      });
    }
    
    if (await knex.schema.hasColumn('facilities', 'image_mime_type')) {
      await knex.schema.alterTable('facilities', (table) => {
        table.dropColumn('image_mime_type');
      });
    }

    // Re-add the URL column if needed
    if (!(await knex.schema.hasColumn('facilities', 'branding_image_url'))) {
      await knex.schema.alterTable('facilities', (table) => {
        table.string('branding_image_url', 500).nullable();
      });
    }
  }
}
