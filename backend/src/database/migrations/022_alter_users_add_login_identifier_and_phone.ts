import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) return;

  // Add columns if not present
  const hasLoginIdentifier = await knex.schema.hasColumn('users', 'login_identifier');
  const hasPhoneNumber = await knex.schema.hasColumn('users', 'phone_number');
  const hasRequiresReset = await knex.schema.hasColumn('users', 'requires_password_reset');

  await knex.schema.alterTable('users', (table) => {
    if (!hasLoginIdentifier) {
      // Add as nullable first to allow backfill before enforcing NOT NULL + UNIQUE
      table.string('login_identifier', 255).nullable().index();
    }
    if (!hasPhoneNumber) {
      table.string('phone_number', 20).nullable().index();
    }
    if (!hasRequiresReset) {
      table.boolean('requires_password_reset').notNullable().defaultTo(false).index();
    }
  });

  // Backfill login_identifier for existing users using email or id fallback
  if (!hasLoginIdentifier) {
    await knex('users').update({
      // Use LOWER(email) when not null or empty; fallback to id
      login_identifier: knex.raw("COALESCE(NULLIF(LOWER(email), ''), id)")
    });

    // Now enforce NOT NULL + UNIQUE
    await knex.schema.alterTable('users', (table) => {
      table.string('login_identifier', 255).notNullable().unique().alter();
    });
  }

  // Make email nullable if it exists
  const hasEmail = await knex.schema.hasColumn('users', 'email');
  if (hasEmail) {
    // MySQL requires full alter for nullability changes
    await knex.schema.alterTable('users', (table) => {
      table.string('email', 255).nullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) return;

  // Revert nullability of email to notNullable (best-effort)
  const hasEmail = await knex.schema.hasColumn('users', 'email');
  if (hasEmail) {
    await knex.schema.alterTable('users', (table) => {
      table.string('email', 255).notNullable().alter();
    });
  }

  const hasLoginIdentifier = await knex.schema.hasColumn('users', 'login_identifier');
  if (hasLoginIdentifier) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('login_identifier');
    });
  }

  const hasPhoneNumber = await knex.schema.hasColumn('users', 'phone_number');
  if (hasPhoneNumber) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('phone_number');
    });
  }

  const hasRequiresReset = await knex.schema.hasColumn('users', 'requires_password_reset');
  if (hasRequiresReset) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('requires_password_reset');
    });
  }
}


