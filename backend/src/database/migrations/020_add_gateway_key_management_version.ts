import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasGateways = await knex.schema.hasTable('gateways');
  if (hasGateways) {
    const hasKeyManagementVersion = await knex.schema.hasColumn('gateways', 'key_management_version');
    if (!hasKeyManagementVersion) {
      await knex.schema.alterTable('gateways', (table) => {
        table
          .enum('key_management_version', ['v1', 'v2'])
          .notNullable()
          .defaultTo('v1')
          .comment('v1=Postman hex format, v2=ED25519 format');
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasGateways = await knex.schema.hasTable('gateways');
  if (hasGateways) {
    const hasKeyManagementVersion = await knex.schema.hasColumn('gateways', 'key_management_version');
    if (hasKeyManagementVersion) {
      await knex.schema.alterTable('gateways', (table) => {
        table.dropColumn('key_management_version');
      });
    }
  }
}

