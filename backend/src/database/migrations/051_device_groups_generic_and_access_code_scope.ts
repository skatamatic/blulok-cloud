import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasMemberTable = await knex.schema.hasTable('device_group_members');
  if (hasMemberTable) {
    const hasDeviceType = await knex.schema.hasColumn('device_group_members', 'device_type');
    if (!hasDeviceType) {
      await knex.schema.alterTable('device_group_members', (table) => {
        table.enum('device_type', ['access_control', 'blulok']).notNullable().defaultTo('access_control').after('device_id');
      });
    }

    try {
      await knex.schema.alterTable('device_group_members', (table) => {
        table.dropForeign(['device_id']);
      });
    } catch {
      // ignore if FK is already absent
    }

    try {
      await knex.schema.alterTable('device_group_members', (table) => {
        table.dropUnique(['group_id', 'device_id'], 'uq_device_group_members_group_device');
      });
    } catch {
      // ignore if old unique index does not exist
    }

    try {
      await knex.schema.alterTable('device_group_members', (table) => {
        table.unique(['group_id', 'device_id', 'device_type'], 'uq_device_group_members_group_device_type');
      });
    } catch {
      // ignore if index already exists
    }
  }

  const hasConfigTable = await knex.schema.hasTable('access_code_configs');
  if (hasConfigTable) {
    await knex.schema.alterTable('access_code_configs', (table) => {
      table.decimal('rotation_interval_hours', 10, 4).unsigned().notNullable().defaultTo(24).alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasConfigTable = await knex.schema.hasTable('access_code_configs');
  if (hasConfigTable) {
    await knex.schema.alterTable('access_code_configs', (table) => {
      table.integer('rotation_interval_hours').unsigned().notNullable().defaultTo(24).alter();
    });
  }

  const hasMemberTable = await knex.schema.hasTable('device_group_members');
  if (hasMemberTable) {
    try {
      await knex.schema.alterTable('device_group_members', (table) => {
        table.dropUnique(['group_id', 'device_id', 'device_type'], 'uq_device_group_members_group_device_type');
      });
    } catch {
      // ignore if index does not exist
    }

    try {
      await knex.schema.alterTable('device_group_members', (table) => {
        table.unique(['group_id', 'device_id'], 'uq_device_group_members_group_device');
      });
    } catch {
      // ignore if index already exists
    }

    const hasDeviceType = await knex.schema.hasColumn('device_group_members', 'device_type');
    if (hasDeviceType) {
      await knex.schema.alterTable('device_group_members', (table) => {
        table.dropColumn('device_type');
      });
    }
  }
}

