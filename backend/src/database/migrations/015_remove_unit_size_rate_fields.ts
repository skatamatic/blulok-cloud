import { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('units', (table) => {
    table.dropColumn('size_sqft');
    table.dropColumn('monthly_rate');
  });
}


export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('units', (table) => {
    table.decimal('size_sqft', 8, 2).nullable();
    table.decimal('monthly_rate', 10, 2).nullable();
  });
}