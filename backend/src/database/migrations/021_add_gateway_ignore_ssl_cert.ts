import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasGateways = await knex.schema.hasTable('gateways');
  if (hasGateways) {
    const hasIgnoreSslCert = await knex.schema.hasColumn('gateways', 'ignore_ssl_cert');
    if (!hasIgnoreSslCert) {
      await knex.schema.alterTable('gateways', (table) => {
        table
          .boolean('ignore_ssl_cert')
          .notNullable()
          .defaultTo(false)
          .comment('Whether to ignore SSL certificate validation for HTTP gateways (useful for self-signed certificates in test environments)');
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasGateways = await knex.schema.hasTable('gateways');
  if (hasGateways) {
    const hasIgnoreSslCert = await knex.schema.hasColumn('gateways', 'ignore_ssl_cert');
    if (hasIgnoreSslCert) {
      await knex.schema.alterTable('gateways', (table) => {
        table.dropColumn('ignore_ssl_cert');
      });
    }
  }
}

