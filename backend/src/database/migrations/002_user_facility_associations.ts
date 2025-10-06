import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Check if facility_admin role already exists in the enum
  const [roleCheck] = await knex.raw(`
    SELECT COLUMN_TYPE 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'users' 
    AND COLUMN_NAME = 'role'
  `);

  const currentEnum = roleCheck[0]?.COLUMN_TYPE || '';
  
  // Only update enum if facility_admin is not already included
  if (!currentEnum.includes('facility_admin')) {
    await knex.raw(`
      ALTER TABLE users 
      MODIFY COLUMN role ENUM('tenant', 'admin', 'facility_admin', 'maintenance', 'blulok_technician', 'dev_admin') 
      NOT NULL DEFAULT 'tenant'
    `);
  }

  // Create user_facility_associations table if it doesn't exist
  if (!(await knex.schema.hasTable('user_facility_associations'))) {
    await knex.schema.createTable('user_facility_associations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.uuid('user_id').notNullable();
    table.uuid('facility_id').notNullable();
    table.timestamps(true, true);
    
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('facility_id').references('id').inTable('facilities').onDelete('CASCADE');
    
    // Ensure unique user-facility pairs
    table.unique(['user_id', 'facility_id'], 'unique_user_facility');
    
    table.index(['user_id']);
    table.index(['facility_id']);
    });
  }

  // Remove the old user_facility_permissions table if it exists (it was replaced)
  await knex.schema.dropTableIfExists('user_facility_permissions');
}

export async function down(knex: Knex): Promise<void> {
  // Drop the associations table
  await knex.schema.dropTableIfExists('user_facility_associations');

  // Revert the role enum (remove facility_admin)
  await knex.raw(`
    ALTER TABLE users 
    MODIFY COLUMN role ENUM('tenant', 'admin', 'maintenance', 'blulok_technician', 'dev_admin') 
    NOT NULL DEFAULT 'tenant'
  `);
}
