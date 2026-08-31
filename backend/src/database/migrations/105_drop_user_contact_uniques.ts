import { Knex } from 'knex';

/**
 * Email and phone become shareable contact fields. Login uniqueness stays on
 * users.login_identifier only.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('users'))) return;

  const tryDropUnique = async (columns: string[], name: string) => {
    try {
      await knex.schema.alterTable('users', (table) => {
        table.dropUnique(columns, name);
      });
    } catch {
      // Index may already be gone or named differently.
    }
  };

  await tryDropUnique(['phone_number'], 'users_phone_number_unique');
  await tryDropUnique(['email'], 'users_email_unique');
  await tryDropUnique(['email'], 'email');
  try {
    await knex.raw('ALTER TABLE users DROP INDEX `email`');
  } catch {
    // SQLite / already dropped.
  }

  const tryAddIndex = async (columns: string[], name: string) => {
    try {
      await knex.schema.alterTable('users', (table) => {
        table.index(columns, name);
      });
    } catch {
      // Already present.
    }
  };
  await tryAddIndex(['email'], 'idx_users_email');
  await tryAddIndex(['phone_number'], 'idx_users_phone_number');
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('users'))) return;

  try {
    await knex.schema.alterTable('users', (table) => {
      table.dropIndex(['email'], 'idx_users_email');
      table.dropIndex(['phone_number'], 'idx_users_phone_number');
    });
  } catch {
    // Indexes may not exist.
  }

  const dupEmail = await knex('users')
    .whereNotNull('email')
    .groupBy('email')
    .havingRaw('COUNT(*) > 1')
    .count({ cnt: '*' });
  const dupPhone = await knex('users')
    .whereNotNull('phone_number')
    .groupBy('phone_number')
    .havingRaw('COUNT(*) > 1')
    .count({ cnt: '*' });

  if (dupEmail.length === 0) {
    await knex.schema.alterTable('users', (table) => {
      table.unique(['email'], 'users_email_unique');
    });
  }
  if (dupPhone.length === 0) {
    await knex.schema.alterTable('users', (table) => {
      table.unique(['phone_number'], 'users_phone_number_unique');
    });
  }
}
