import { Knex } from 'knex';

/**
 * Add 'bridge' to firmware target_type enum (mesh range-extender OTA).
 *
 * MySQL ENUM columns must be fully redefined to add a value.
 * Order matches UI tabs: gateway → lock → friend_node → bridge → access_control.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE firmware_images MODIFY COLUMN target_type ENUM('gateway','lock','friend_node','bridge','access_control') NOT NULL DEFAULT 'gateway'`,
  );
  await knex.raw(
    `ALTER TABLE firmware_pushes MODIFY COLUMN target_type ENUM('gateway','lock','friend_node','bridge','access_control') NOT NULL DEFAULT 'gateway'`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex('firmware_images').where('target_type', 'bridge').update({ target_type: 'gateway' });
  await knex('firmware_pushes').where('target_type', 'bridge').update({ target_type: 'gateway' });

  await knex.raw(
    `ALTER TABLE firmware_images MODIFY COLUMN target_type ENUM('gateway','lock','friend_node','access_control') NOT NULL DEFAULT 'gateway'`,
  );
  await knex.raw(
    `ALTER TABLE firmware_pushes MODIFY COLUMN target_type ENUM('gateway','lock','friend_node','access_control') NOT NULL DEFAULT 'gateway'`,
  );
}
