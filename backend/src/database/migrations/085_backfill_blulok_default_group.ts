import type { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_ACCESS_GROUP_NAME } from '../../constants/access-group.constants';

/**
 * Backfill BluLok unit locks into the facility default access group.
 *
 * Every device (access-control and blulok) belongs to the default group unless it has been
 * moved into a specific (non-default, non-global) zone group. Migrations 083/084 only handled
 * access-control devices; this pass extends the same idempotent backfill to blulok locks.
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

    const bluLokDevices = await knex('blulok_devices as bd')
      .select('bd.id')
      .join('gateways as g', 'g.id', 'bd.gateway_id')
      .where('g.facility_id', facilityId);

    for (const row of bluLokDevices) {
      const deviceId = String(row.id);
      const inSpecificGroup = await knex('device_group_members as m')
        .join('device_groups as dg', 'dg.id', 'm.group_id')
        .where('m.device_id', deviceId)
        .andWhere('m.device_type', 'blulok')
        .andWhere('dg.facility_id', facilityId)
        .andWhere('dg.is_default', false)
        .andWhere('dg.is_global_shared', false)
        .first();

      if (inSpecificGroup) {
        await knex('device_group_members')
          .where({
            group_id: defaultGroupId,
            device_id: deviceId,
            device_type: 'blulok',
          })
          .del();
        continue;
      }

      const alreadyInDefault = await knex('device_group_members')
        .where({
          group_id: defaultGroupId,
          device_id: deviceId,
          device_type: 'blulok',
        })
        .first();

      if (alreadyInDefault) continue;

      await knex('device_group_members')
        .insert({
          id: uuidv4(),
          group_id: defaultGroupId,
          device_id: deviceId,
          device_type: 'blulok',
        })
        .onConflict(['group_id', 'device_id', 'device_type'])
        .ignore();
    }
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Backfill migration — no down action.
}
