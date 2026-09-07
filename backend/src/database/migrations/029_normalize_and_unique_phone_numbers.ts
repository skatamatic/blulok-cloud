import { Knex } from 'knex';
import { toE164 } from '@/utils/phone.util';

export async function up(knex: Knex): Promise<void> {
  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) return;

  const hasPhoneNumber = await knex.schema.hasColumn('users', 'phone_number');
  if (!hasPhoneNumber) return;

  // Normalize existing phone numbers to E.164
  const rows = await knex('users').select('id', 'phone_number');
  for (const row of rows as Array<{ id: string; phone_number: string | null }>) {
    if (row.phone_number) {
      const normalized = toE164(row.phone_number);
      await knex('users')
        .where({ id: row.id })
        .update({ phone_number: normalized || null });
    }
  }

  // Deduplicate any remaining conflicting phone numbers by nulling extras,
  // keeping the earliest created user for each phone_number.
  const dupPhones = await knex('users')
    .select('phone_number')
    .count<{ phone_number: string; cnt: number }[]>({ cnt: '*' })
    .whereNotNull('phone_number')
    .groupBy('phone_number')
    .havingRaw('COUNT(*) > 1');

  for (const dup of dupPhones) {
    const phone = dup.phone_number;
    if (!phone) continue;

    const usersWithPhone = await knex('users')
      .select('id')
      .where('phone_number', phone)
      .orderBy('created_at', 'asc');

    if (usersWithPhone.length > 1) {
      const [, ...toNull] = usersWithPhone;
      const idsToNull = toNull.map((u: any) => u.id);
      // eslint-disable-next-line no-console
      console.warn(
        `[029_normalize_and_unique_phone_numbers] Deduplicating phone_number ${phone} for user IDs: ${idsToNull.join(
          ', '
        )}`
      );

      await knex('users')
        .whereIn('id', idsToNull)
        .update({ phone_number: null });
    }
  }

  // Enforce uniqueness on phone_number where not null
  await knex.schema.alterTable('users', (table) => {
    table.unique(['phone_number'], 'users_phone_number_unique');
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) return;

  const hasPhoneNumber = await knex.schema.hasColumn('users', 'phone_number');
  if (!hasPhoneNumber) return;

  // Drop unique index if it exists
  await knex.schema.alterTable('users', (table) => {
    table.dropUnique(['phone_number'], 'users_phone_number_unique');
  });
}


