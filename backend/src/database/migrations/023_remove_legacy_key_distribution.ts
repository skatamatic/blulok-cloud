import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
	// Drop device_key_distributions if exists
	if (await knex.schema.hasTable('device_key_distributions')) {
		await knex.schema.dropTable('device_key_distributions');
	}

	// Drop gateway_commands and gateway_command_attempts if they exist
	if (await knex.schema.hasTable('gateway_command_attempts')) {
		await knex.schema.dropTable('gateway_command_attempts');
	}
	if (await knex.schema.hasTable('gateway_commands')) {
		await knex.schema.dropTable('gateway_commands');
	}

	// Remove users.key_status if present
	if (await knex.schema.hasTable('users')) {
		const hasCol = await knex.schema.hasColumn('users', 'key_status');
		if (hasCol) {
			await knex.schema.alterTable('users', (table) => {
				table.dropColumn('key_status');
			});
		}
	}
}

export async function down(_knex: Knex): Promise<void> {
	// No-op: destructive cleanup; do not recreate legacy structures
}
