import { Knex } from 'knex';
import bcrypt from 'bcrypt';

export async function seed(knex: Knex): Promise<void> {
  // Deletes ALL existing entries
  await knex('users').del();

  // Hash passwords
  const adminPasswordHash = await bcrypt.hash('Admin123!@#', 12);
  const devAdminPasswordHash = await bcrypt.hash('DevAdmin123!@#', 12);

  // Inserts seed entries
  await knex('users').insert([
    {
      id: '550e8400-e29b-41d4-a716-446655440010',
      email: 'admin@blulok.com',
      login_identifier: 'admin@blulok.com',
      password_hash: adminPasswordHash,
      first_name: 'System',
      last_name: 'Administrator',
      role: 'admin',
      is_active: true,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440011',
      email: 'devadmin@blulok.com',
      login_identifier: 'devadmin@blulok.com',
      password_hash: devAdminPasswordHash,
      first_name: 'Developer',
      last_name: 'Admin',
      role: 'dev_admin',
      is_active: true,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
  ]);
}
