import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('facilities')) {
    // Remove old fields that are no longer needed
    const columnsToRemove = ['city', 'state', 'zip_code', 'country', 'is_active'];
    
    for (const column of columnsToRemove) {
      if (await knex.schema.hasColumn('facilities', column)) {
        await knex.schema.alterTable('facilities', (table) => {
          table.dropColumn(column);
        });
      }
    }

    // Ensure all required new fields exist
    const requiredFields = [
      { name: 'contact_email', type: 'string', length: 255, nullable: true },
      { name: 'contact_phone', type: 'string', length: 50, nullable: true },
      { name: 'branding_image', type: 'text', nullable: true },
      { name: 'image_mime_type', type: 'string', length: 100, nullable: true }
    ];

    for (const field of requiredFields) {
      if (!(await knex.schema.hasColumn('facilities', field.name))) {
        await knex.schema.alterTable('facilities', (table) => {
          if (field.type === 'string') {
            table.string(field.name, field.length).nullable();
          } else if (field.type === 'text') {
            table.text(field.name).nullable();
          }
        });
      }
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('facilities')) {
    // Add back the old fields
    await knex.schema.alterTable('facilities', (table) => {
      table.string('city', 100).notNullable().defaultTo('');
      table.string('state', 50).notNullable().defaultTo('');
      table.string('zip_code', 20).notNullable().defaultTo('');
      table.string('country', 50).notNullable().defaultTo('US');
      table.boolean('is_active').notNullable().defaultTo(true);
    });

    // Remove the new fields
    const newFieldsToRemove = ['contact_email', 'contact_phone', 'branding_image', 'image_mime_type'];
    
    for (const field of newFieldsToRemove) {
      if (await knex.schema.hasColumn('facilities', field)) {
        await knex.schema.alterTable('facilities', (table) => {
          table.dropColumn(field);
        });
      }
    }
  }
}
