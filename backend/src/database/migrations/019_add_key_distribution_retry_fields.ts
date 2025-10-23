import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasDistributions = await knex.schema.hasTable('device_key_distributions');
  if (hasDistributions) {
    const hasRetryCount = await knex.schema.hasColumn('device_key_distributions', 'retry_count');
    if (!hasRetryCount) {
      await knex.schema.alterTable('device_key_distributions', (table) => {
        table.integer('retry_count').notNullable().defaultTo(0);
      });
    }

    const hasGatewayId = await knex.schema.hasColumn('device_key_distributions', 'gateway_id');
    if (!hasGatewayId) {
      await knex.schema.alterTable('device_key_distributions', (table) => {
        table.uuid('gateway_id').nullable();
        table.index(['gateway_id']);
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasDistributions = await knex.schema.hasTable('device_key_distributions');
  if (hasDistributions) {
    const hasGatewayId = await knex.schema.hasColumn('device_key_distributions', 'gateway_id');
    if (hasGatewayId) {
      await knex.schema.alterTable('device_key_distributions', (table) => {
        table.dropColumn('gateway_id');
      });
    }

    const hasRetryCount = await knex.schema.hasColumn('device_key_distributions', 'retry_count');
    if (hasRetryCount) {
      await knex.schema.alterTable('device_key_distributions', (table) => {
        table.dropColumn('retry_count');
      });
    }
  }
}
