import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add gateway configuration columns to gateways table
  await knex.schema.alterTable('gateways', (table) => {
    // Gateway type (physical, http, simulated)
    table.enum('gateway_type', ['physical', 'http', 'simulated']).defaultTo('http');

    // Connection configuration
    table.string('connection_url', 500).nullable(); // For physical WebSocket gateways
    table.string('base_url', 500).nullable(); // For HTTP gateways
    table.string('api_key', 255).nullable(); // For HTTP gateways
    table.string('username', 100).nullable(); // For HTTP gateways
    table.string('password', 255).nullable(); // Encrypted password for HTTP gateways
    table.string('protocol_version', 50).defaultTo('1.1');
    table.integer('poll_frequency_ms').defaultTo(30000); // Polling frequency for HTTP gateways
  });
}

export async function down(knex: Knex): Promise<void> {
  // Remove gateway configuration columns from gateways table
  await knex.schema.alterTable('gateways', (table) => {
    table.dropColumn('gateway_type');
    table.dropColumn('connection_url');
    table.dropColumn('base_url');
    table.dropColumn('api_key');
    table.dropColumn('username');
    table.dropColumn('password');
    table.dropColumn('protocol_version');
    table.dropColumn('poll_frequency_ms');
  });
}
