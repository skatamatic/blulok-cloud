import { Knex } from 'knex';

/**
 * Add 'access_control' to firmware target_type enum.
 *
 * MySQL ENUM columns must be fully redefined to add a value.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE firmware_images MODIFY COLUMN target_type ENUM('gateway','lock','friend_node','access_control') NOT NULL DEFAULT 'gateway'`,
  );
  await knex.raw(
    `ALTER TABLE firmware_pushes MODIFY COLUMN target_type ENUM('gateway','lock','friend_node','access_control') NOT NULL DEFAULT 'gateway'`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex('firmware_images').where('target_type', 'access_control').update({ target_type: 'gateway' });
  await knex('firmware_pushes').where('target_type', 'access_control').update({ target_type: 'gateway' });

  await knex.raw(
    `ALTER TABLE firmware_images MODIFY COLUMN target_type ENUM('gateway','lock','friend_node') NOT NULL DEFAULT 'gateway'`,
  );
  await knex.raw(
    `ALTER TABLE firmware_pushes MODIFY COLUMN target_type ENUM('gateway','lock','friend_node') NOT NULL DEFAULT 'gateway'`,
  );
}
