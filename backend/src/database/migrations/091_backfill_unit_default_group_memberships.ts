import type { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_ACCESS_GROUP_NAME } from '../../constants/access-group.constants';

/**
 * Backfill lock-less units into the facility default access group.
 *
 * Group membership is device-centric; units without an assigned BluLok lock are stored as
 * unit-anchored blulok rows (device_id = source_unit_id = unit id). Migrations 083–085 only
 * backfilled access-control devices and inventory locks.
 */
export async function up(knex: Knex): Promise<void> {
  const facilities = await knex('facilities').select('id');

  for (const facility of facilities) {
    const facilityId = String(facility.id);
    let defaultGroup = await knex('device_groups')
      .where({ facility_id: facilityId, is_default: true })
      .first();

    if (!defaultGroup) {
      const existingGlobal = await knex('device_groups')
        .where({ facility_id: facilityId, is_global_shared: true })
        .orderBy('created_at', 'asc')
        .first();

      if (existingGlobal) {
        await knex('device_groups')
          .where('id', existingGlobal.id)
          .update({
            is_default: true,
            is_global_shared: true,
            is_active: true,
            updated_at: knex.fn.now(),
          });
        defaultGroup = await knex('device_groups').where('id', existingGlobal.id).first();
      } else {
        const id = uuidv4();
        await knex('device_groups').insert({
          id,
          facility_id: facilityId,
          group_type: 'access_code',
          is_global_shared: true,
          is_default: true,
          name: DEFAULT_ACCESS_GROUP_NAME,
          description: 'Default access group — all tenants in this facility',
          is_active: true,
        });
        defaultGroup = await knex('device_groups').where('id', id).first();
      }
    }

    if (!defaultGroup) continue;

    const defaultGroupId = String(defaultGroup.id);
    const units = await knex('units').select('id').where('facility_id', facilityId);

    for (const unitRow of units) {
      const unitId = String(unitRow.id);
      const boundLock = await knex('blulok_devices').select('id').where('unit_id', unitId).first();
      if (boundLock) continue;

      const inSpecificGroup = await knex('device_group_members as m')
        .join('device_groups as dg', 'dg.id', 'm.group_id')
        .where('m.device_type', 'blulok')
        .andWhere('dg.facility_id', facilityId)
        .andWhere('dg.is_default', false)
        .andWhere('dg.is_global_shared', false)
        .where(function matchUnit() {
          this.where('m.source_unit_id', unitId).orWhere('m.device_id', unitId);
        })
        .first();

      if (inSpecificGroup) {
        await knex('device_group_members')
          .where({ group_id: defaultGroupId, device_type: 'blulok' })
          .where(function matchUnit() {
            this.where('source_unit_id', unitId).orWhere('device_id', unitId);
          })
          .del();
        continue;
      }

      const alreadyInDefault = await knex('device_group_members')
        .where({
          group_id: defaultGroupId,
          device_type: 'blulok',
          source_unit_id: unitId,
        })
        .first();

      if (alreadyInDefault) continue;

      await knex('device_group_members')
        .insert({
          id: uuidv4(),
          group_id: defaultGroupId,
          device_id: unitId,
          device_type: 'blulok',
          source_unit_id: unitId,
        })
        .onConflict(['group_id', 'device_id', 'device_type'])
        .ignore();
    }
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Backfill migration — no down action.
}
