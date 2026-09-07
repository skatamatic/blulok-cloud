import { Knex } from 'knex';

/**
 * Sticker ZTP: permanent device public key + claim/release/revoke audit columns.
 * See cursorDocs/gateway-ztp-sticker-design.md
 */
export async function up(knex: Knex): Promise<void> {
  const cols = [
    'public_key',
    'claimed_by_user_id',
    'claimed_at',
    'released_at',
    'revoked_at',
  ] as const;
  const existing: Record<string, boolean> = {};
  for (const col of cols) {
    existing[col] = await knex.schema.hasColumn('gateways', col);
  }

  await knex.schema.alterTable('gateways', (table) => {
    if (!existing.public_key) {
      table.text('public_key').nullable();
    }
    if (!existing.claimed_by_user_id) {
      table.uuid('claimed_by_user_id').nullable();
    }
    if (!existing.claimed_at) {
      table.timestamp('claimed_at').nullable();
    }
    if (!existing.released_at) {
      table.timestamp('released_at').nullable();
    }
    if (!existing.revoked_at) {
      table.timestamp('revoked_at').nullable();
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const cols = [
    'public_key',
    'claimed_by_user_id',
    'claimed_at',
    'released_at',
    'revoked_at',
  ] as const;
  const existing: Record<string, boolean> = {};
  for (const col of cols) {
    existing[col] = await knex.schema.hasColumn('gateways', col);
  }

  await knex.schema.alterTable('gateways', (table) => {
    for (const col of cols) {
      if (existing[col]) table.dropColumn(col);
    }
  });
}
