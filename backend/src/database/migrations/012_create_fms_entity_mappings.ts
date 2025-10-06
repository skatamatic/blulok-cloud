import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('fms_entity_mappings', (table) => {
    table.uuid('id').primary();
    table.uuid('facility_id').notNullable();
    table.string('entity_type', 20).notNullable(); // 'user' or 'unit'
    table.string('external_id', 255).notNullable(); // ID from FMS
    table.uuid('internal_id').notNullable(); // Our entity ID
    table.string('provider_type', 50).notNullable(); // Which FMS provider
    table.json('metadata').nullable(); // Additional mapping data
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Foreign key
    table.foreign('facility_id').references('id').inTable('facilities').onDelete('CASCADE');

    // Indexes
    table.index('facility_id');
    table.index('entity_type');
    table.index('external_id');
    table.index('internal_id');
    table.index(['facility_id', 'entity_type']);
    table.index(['facility_id', 'external_id', 'entity_type']);
    
    // Unique constraint: one mapping per facility + entity_type + external_id
    table.unique(['facility_id', 'entity_type', 'external_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('fms_entity_mappings');
}
