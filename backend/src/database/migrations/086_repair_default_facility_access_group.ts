import type { Knex } from 'knex';
import {
  DEFAULT_ACCESS_GROUP_NAME,
  LEGACY_DEFAULT_ACCESS_GROUP_NAMES,
} from '@/constants/access-group.constants';

/**
 * Normalize per-facility default access groups: single default, canonical name,
 * legacy "free" / "All Facility Access" promoted when present.
 */
export async function up(knex: Knex): Promise<void> {
  const facilities = await knex('facilities').select('id');

  for (const facility of facilities) {
    const facilityId = String(facility.id);

    let candidate: { id: string } | undefined;

    for (const legacyName of LEGACY_DEFAULT_ACCESS_GROUP_NAMES) {
      const legacy = await knex('device_groups')
        .where({ facility_id: facilityId })
        .whereRaw('LOWER(name) = ?', [legacyName.toLowerCase()])
        .orderBy('is_global_shared', 'desc')
        .orderBy('created_at', 'asc')
        .first();
      if (legacy) {
        candidate = legacy;
        break;
      }
    }

    if (!candidate) {
      candidate = await knex('device_groups')
        .where({ facility_id: facilityId, is_global_shared: true })
        .orderBy('created_at', 'asc')
        .first();
    }

    if (!candidate) {
      candidate = await knex('device_groups')
        .where({ facility_id: facilityId, is_default: true })
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
        is_global_shared: true,
        is_active: true,
        group_type: 'access_code',
        name: DEFAULT_ACCESS_GROUP_NAME,
        description: 'Default access group — all tenants in this facility',
        updated_at: knex.fn.now(),
      });
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Data repair — no rollback.
}
