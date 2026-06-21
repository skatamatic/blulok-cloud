import type { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_ACCESS_GROUP_NAME } from '../../constants/access-group.constants';

/**
 * Repair pass for migration 083: re-backfill access-control devices into the default
 * group using zone-specific group detection (exclude legacy is_global_shared groups).
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

    const accessControlDevices = await knex('access_control_devices as acd')
      .select('acd.id')
      .join('gateways as g', 'g.id', 'acd.gateway_id')
      .where('g.facility_id', facilityId);

    for (const row of accessControlDevices) {
      const deviceId = String(row.id);
      const inSpecificGroup = await knex('device_group_members as m')
        .join('device_groups as dg', 'dg.id', 'm.group_id')
        .where('m.device_id', deviceId)
        .andWhere('m.device_type', 'access_control')
        .andWhere('dg.facility_id', facilityId)
        .andWhere('dg.is_default', false)
        .andWhere('dg.is_global_shared', false)
        .first();

      if (inSpecificGroup) {
        await knex('device_group_members')
          .where({
            group_id: defaultGroupId,
            device_id: deviceId,
            device_type: 'access_control',
          })
          .del();
        continue;
      }

      const alreadyInDefault = await knex('device_group_members')
        .where({
          group_id: defaultGroupId,
          device_id: deviceId,
          device_type: 'access_control',
        })
        .first();

      if (alreadyInDefault) continue;

      await knex('device_group_members')
        .insert({
          id: uuidv4(),
          group_id: defaultGroupId,
          device_id: deviceId,
          device_type: 'access_control',
        })
        .onConflict(['group_id', 'device_id', 'device_type'])
        .ignore();
    }
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Repair migration — no down action.
}
