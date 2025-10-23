import { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('fms_changes', (table) => {
    table.boolean('is_valid').nullable(); // Whether this change is valid and can be applied
    table.json('validation_errors').nullable(); // List of validation error messages
  });
}


export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('fms_changes', (table) => {
    table.dropColumn('is_valid');
    table.dropColumn('validation_errors');
  });
}

