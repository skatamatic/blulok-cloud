import type { Knex } from 'knex';
import {
  DEFAULT_ACCESS_GROUP_NAME,
  LEGACY_DEFAULT_ACCESS_GROUP_NAMES,
} from '@/constants/access-group.constants';

/**
 * Collapse facility-wide entitlement onto is_default and remove is_global_shared.
 *
 * Before: is_global_shared and is_default could drift independently.
 * After: only is_default marks the protected facility-wide access group.
 */
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('device_groups', 'is_global_shared');
  if (!hasColumn) {
    return;
  }

  // Promote legacy global-shared-only rows to default.
  await knex('device_groups')
    .where({ is_global_shared: true, is_default: false })
    .update({ is_default: true, updated_at: knex.fn.now() });

  const facilities = await knex('facilities').select('id');

  for (const facility of facilities) {
    const facilityId = String(facility.id);

    let candidate: { id: string } | undefined;

    for (const legacyName of LEGACY_DEFAULT_ACCESS_GROUP_NAMES) {
      const legacy = await knex('device_groups')
        .where({ facility_id: facilityId })
        .whereRaw('LOWER(name) = ?', [legacyName.toLowerCase()])
        .orderBy('is_default', 'desc')
        .orderBy('created_at', 'asc')
        .first();
      if (legacy) {
        candidate = legacy;
        break;
      }
    }

    if (!candidate) {
      candidate = await knex('device_groups')
        .where({ facility_id: facilityId, is_default: true })
        .orderBy('created_at', 'asc')
        .first();
    }

    if (!candidate) {
      continue;
    }

    const winnerId = String(candidate.id);

    await knex('device_groups')
      .where({ facility_id: facilityId })
      .whereNot('id', winnerId)
      .update({ is_default: false, updated_at: knex.fn.now() });

    await knex('device_groups')
      .where('id', winnerId)
      .update({
        is_default: true,
        is_active: true,
        group_type: 'access_code',
        name: DEFAULT_ACCESS_GROUP_NAME,
        description: 'Default access group — all tenants in this facility',
        updated_at: knex.fn.now(),
      });
  }

  const hasIndex = await knex.schema.hasTable('device_groups');
  if (hasIndex) {
    try {
      await knex.schema.alterTable('device_groups', (table) => {
        table.dropIndex(
          ['facility_id', 'group_type', 'is_global_shared', 'is_active'],
          'idx_device_groups_facility_type_global_active',
        );
      });
    } catch {
      // Index may already be absent on some environments.
    }
  }

  await knex.schema.alterTable('device_groups', (table) => {
    table.dropColumn('is_global_shared');
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('device_groups', 'is_global_shared');
  if (hasColumn) {
    return;
  }

  await knex.schema.alterTable('device_groups', (table) => {
    table.boolean('is_global_shared').notNullable().defaultTo(false).after('group_type');
  });

  await knex('device_groups')
    .where({ is_default: true })
    .update({ is_global_shared: true, updated_at: knex.fn.now() });

  await knex.schema.alterTable('device_groups', (table) => {
    table.index(
      ['facility_id', 'group_type', 'is_global_shared', 'is_active'],
      'idx_device_groups_facility_type_global_active',
    );
  });
}
