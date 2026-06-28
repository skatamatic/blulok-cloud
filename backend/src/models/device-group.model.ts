import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '@/services/database.service';

export type DeviceGroupMemberType = 'access_control' | 'blulok';
export type DeviceGroupType = 'zone' | 'access_code';

export interface DeviceGroup {
  id: string;
  facility_id: string;
  group_type: DeviceGroupType;
  is_global_shared: boolean;
  is_default: boolean;
  access_code_current_code?: string | null;
  access_code_current_valid_from?: Date | null;
  access_code_current_valid_until?: Date | null;
  name: string;
  description?: string;
  settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface DeviceGroupMember {
  id: string;
  group_id: string;
  device_id: string;
  device_type: DeviceGroupMemberType;
  source_unit_id?: string | null;
  created_at: Date;
}

export interface CreateDeviceGroupData {
  facility_id: string;
  group_type?: DeviceGroupType;
  is_global_shared?: boolean;
  is_default?: boolean;
  name: string;
  description?: string;
  settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateDeviceGroupData {
  group_type?: DeviceGroupType;
  is_global_shared?: boolean;
  is_default?: boolean;
  access_code_current_code?: string | null;
  access_code_current_valid_from?: Date | null;
  access_code_current_valid_until?: Date | null;
  name?: string;
  description?: string;
  settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  is_active?: boolean;
}

export class DeviceGroupModel {
  private db = DatabaseService.getInstance();

  private deserializeGroup(row: Record<string, unknown>): DeviceGroup {
    const parseMaybeJson = (value: unknown): Record<string, unknown> | undefined => {
      if (!value) return undefined;
      if (typeof value === 'object') return value as Record<string, unknown>;
      if (typeof value === 'string') {
        try {
          return JSON.parse(value) as Record<string, unknown>;
        } catch {
          return undefined;
        }
      }
      return undefined;
    };

    return {
      ...(row as unknown as DeviceGroup),
      group_type: ((row.group_type as DeviceGroupType) || 'zone'),
      is_global_shared: Boolean(row.is_global_shared),
      is_default: Boolean(row.is_default),
      access_code_current_code: (row.access_code_current_code as string | null) ?? null,
      access_code_current_valid_from: row.access_code_current_valid_from ? new Date(String(row.access_code_current_valid_from)) : null,
      access_code_current_valid_until: row.access_code_current_valid_until ? new Date(String(row.access_code_current_valid_until)) : null,
      settings: parseMaybeJson(row.settings),
      metadata: parseMaybeJson(row.metadata),
    };
  }

  async create(data: CreateDeviceGroupData): Promise<DeviceGroup> {
    const knex = this.db.connection;
    const id = uuidv4();
    await knex('device_groups').insert({
      id,
      facility_id: data.facility_id,
      group_type: data.group_type || 'zone',
      is_global_shared: Boolean(data.is_global_shared),
      is_default: Boolean(data.is_default),
      name: data.name,
      description: data.description ?? null,
      settings: data.settings ? JSON.stringify(data.settings) : null,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      is_active: true,
    });
    const group = await knex('device_groups').where('id', id).first();
    return this.deserializeGroup(group as Record<string, unknown>);
  }

  async findById(id: string): Promise<DeviceGroup | null> {
    const knex = this.db.connection;
    const row = await knex('device_groups').where('id', id).first();
    return row ? this.deserializeGroup(row as Record<string, unknown>) : null;
  }

  async findByFacility(facilityId: string, groupType?: DeviceGroupType): Promise<DeviceGroup[]> {
    const knex = this.db.connection;
    const query = knex('device_groups').where('facility_id', facilityId);
    if (groupType) {
      query.andWhere('group_type', groupType);
    }
    const rows = await query
      .orderBy('is_default', 'desc')
      .orderBy('name', 'asc');
    return rows.map((row) => this.deserializeGroup(row as Record<string, unknown>));
  }

  async update(id: string, data: UpdateDeviceGroupData): Promise<DeviceGroup | null> {
    const knex = this.db.connection;
    const payload: Record<string, unknown> = { updated_at: new Date() };
    if (data.name !== undefined) payload.name = data.name;
    if (data.group_type !== undefined) payload.group_type = data.group_type;
    if (data.is_global_shared !== undefined) payload.is_global_shared = Boolean(data.is_global_shared);
    if (data.is_default !== undefined) payload.is_default = Boolean(data.is_default);
    if (data.access_code_current_code !== undefined) payload.access_code_current_code = data.access_code_current_code;
    if (data.access_code_current_valid_from !== undefined) payload.access_code_current_valid_from = data.access_code_current_valid_from;
    if (data.access_code_current_valid_until !== undefined) payload.access_code_current_valid_until = data.access_code_current_valid_until;
    if (data.description !== undefined) payload.description = data.description;
    if (data.is_active !== undefined) payload.is_active = data.is_active;
    if (data.settings !== undefined) payload.settings = JSON.stringify(data.settings);
    if (data.metadata !== undefined) payload.metadata = JSON.stringify(data.metadata);
    await knex('device_groups').where('id', id).update(payload);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    const knex = this.db.connection;
    await knex('device_groups').where('id', id).del();
  }

  async addMember(
    groupId: string,
    deviceId: string,
    deviceType: DeviceGroupMemberType = 'access_control',
    sourceUnitId?: string,
  ): Promise<DeviceGroupMember> {
    const knex = this.db.connection;
    if (sourceUnitId) {
      const existingUnitLinked = await knex('device_group_members')
        .where('group_id', groupId)
        .andWhere('source_unit_id', sourceUnitId)
        .andWhere('device_type', 'blulok')
        .first();

      if (existingUnitLinked) {
        if (String(existingUnitLinked.device_id) !== deviceId) {
          await knex('device_group_members')
            .where('id', existingUnitLinked.id)
            .update({ device_id: deviceId });
        }
        const updated = await knex('device_group_members').where('id', existingUnitLinked.id).first();
        return updated as DeviceGroupMember;
      }

      const existingDevice = await knex('device_group_members')
        .where('group_id', groupId)
        .andWhere('device_id', deviceId)
        .andWhere('device_type', 'blulok')
        .first();
      if (existingDevice) {
        await knex('device_group_members')
          .where('id', existingDevice.id)
          .update({ source_unit_id: sourceUnitId });
        const updated = await knex('device_group_members').where('id', existingDevice.id).first();
        return updated as DeviceGroupMember;
      }

      const id = uuidv4();
      await knex('device_group_members').insert({
        id,
        group_id: groupId,
        device_id: deviceId,
        device_type: 'blulok',
        source_unit_id: sourceUnitId,
      });
      const row = await knex('device_group_members').where('id', id).first();
      return row as DeviceGroupMember;
    }

    const id = uuidv4();
    await knex('device_group_members')
      .insert({
        id,
        group_id: groupId,
        device_id: deviceId,
        device_type: deviceType,
      })
      .onConflict(['group_id', 'device_id', 'device_type'])
      .ignore();

    const row = await knex('device_group_members')
      .where('group_id', groupId)
      .andWhere('device_id', deviceId)
      .andWhere('device_type', deviceType)
      .first();
    return row as DeviceGroupMember;
  }

  async removeMember(groupId: string, deviceId: string, deviceType?: DeviceGroupMemberType): Promise<void> {
    const knex = this.db.connection;
    let linkedUnitId: string | null = null;
    if (deviceType === 'blulok') {
      const device = await knex('blulok_devices').select('unit_id').where('id', deviceId).first();
      if (device?.unit_id) {
        linkedUnitId = String(device.unit_id);
      }
    }

    const query = knex('device_group_members').where('group_id', groupId).where(function matchMember() {
      this.where('device_id', deviceId);
      if (deviceType === 'blulok') {
        this.orWhere('source_unit_id', deviceId);
        if (linkedUnitId) {
          this.orWhere('source_unit_id', linkedUnitId);
        }
      }
    });

    if (deviceType) {
      query.andWhere('device_type', deviceType);
    }
    await query.del();
  }

  async getMembers(groupId: string): Promise<DeviceGroupMember[]> {
    const knex = this.db.connection;
    const rows = await knex('device_group_members as m')
      .leftJoin('blulok_devices as bd', function joinCurrentLock() {
        this.on('bd.unit_id', '=', 'm.source_unit_id').andOnVal('m.device_type', '=', 'blulok');
      })
      .select(
        'm.id',
        'm.group_id',
        'm.device_type',
        'm.source_unit_id',
        'm.created_at',
        knex.raw('COALESCE(bd.id, m.device_id) as device_id'),
      )
      .where('m.group_id', groupId)
      .orderBy('m.created_at', 'asc');
    return rows as DeviceGroupMember[];
  }

  async syncUnitLinkedMembers(
    unitId: string,
    deviceId: string,
    trx?: import('knex').Knex.Transaction,
  ): Promise<number> {
    const knex = trx ?? this.db.connection;

    const linkedGroupIds = await knex('device_group_members')
      .where({ source_unit_id: unitId, device_type: 'blulok' })
      .pluck('group_id');

    if (linkedGroupIds.length > 0) {
      await knex('device_group_members')
        .whereIn('group_id', linkedGroupIds)
        .where({ device_id: deviceId, device_type: 'blulok' })
        .whereNull('source_unit_id')
        .del();
    }

    return knex('device_group_members')
      .where('source_unit_id', unitId)
      .andWhere('device_type', 'blulok')
      .update({ device_id: deviceId });
  }

  /**
   * Removes BluLok group rows keyed only by device id (not unit-anchored membership).
   * Unit-linked rows are preserved so access groups stay tied to the unit across lock swaps.
   */
  async removeDirectBluLokMembershipsForDevice(
    deviceId: string,
    trx?: import('knex').Knex.Transaction,
  ): Promise<number> {
    const knex = trx ?? this.db.connection;
    return knex('device_group_members')
      .where({ device_id: deviceId, device_type: 'blulok' })
      .whereNull('source_unit_id')
      .del();
  }

  /**
   * Removes BluLok rows from default access groups that no longer resolve to a facility unit
   * or inventory lock (stale zombies after unit/lock deletion).
   */
  async removeUnknownBlulokDefaultGroupMembers(): Promise<{ removed: number; byFacility: Record<string, number> }> {
    const knex = this.db.connection;

    const unknownRows = await knex('device_group_members as m')
      .join('device_groups as g', 'g.id', 'm.group_id')
      .select('m.id', 'g.facility_id')
      .where('g.is_default', true)
      .andWhere('m.device_type', 'blulok')
      .where(function markUnknown() {
        this.where(function unitAnchorMissingUnit() {
          this.whereNotNull('m.source_unit_id').whereNotExists(function unitExistsInFacility() {
            this.select(knex.raw('1'))
              .from('units as u')
              .whereRaw('u.id = m.source_unit_id')
              .whereRaw('u.facility_id = g.facility_id');
          });
        }).orWhere(function deviceOnlyMissingLock() {
          this.whereNull('m.source_unit_id').whereNotExists(function lockExistsInFacility() {
            this.select(knex.raw('1'))
              .from('blulok_devices as bd')
              .join('gateways as gw', 'gw.id', 'bd.gateway_id')
              .whereRaw('bd.id = m.device_id')
              .whereRaw('gw.facility_id = g.facility_id');
          });
        });
      });

    if (unknownRows.length === 0) {
      return { removed: 0, byFacility: {} };
    }

    const byFacility: Record<string, number> = {};
    for (const row of unknownRows) {
      const facilityId = String(row.facility_id);
      byFacility[facilityId] = (byFacility[facilityId] ?? 0) + 1;
    }

    await knex('device_group_members')
      .whereIn('id', unknownRows.map((row) => String(row.id)))
      .del();

    return { removed: unknownRows.length, byFacility };
  }

  async findDefaultByFacility(facilityId: string): Promise<DeviceGroup | null> {
    const knex = this.db.connection;
    const row = await knex('device_groups')
      .where({ facility_id: facilityId, is_default: true })
      .first();
    return row ? this.deserializeGroup(row as Record<string, unknown>) : null;
  }

  async countDefaultGroupsForFacility(facilityId: string): Promise<number> {
    const knex = this.db.connection;
    const row = await knex('device_groups')
      .where({ facility_id: facilityId, is_default: true })
      .count<{ count: string | number }[]>('* as count')
      .first();
    return Number(row?.count ?? 0);
  }

  async findByFacilityAndName(facilityId: string, name: string): Promise<DeviceGroup | null> {
    const knex = this.db.connection;
    const row = await knex('device_groups')
      .where({ facility_id: facilityId })
      .whereRaw('LOWER(name) = ?', [name.toLowerCase()])
      .orderBy('is_global_shared', 'desc')
      .orderBy('created_at', 'asc')
      .first();
    return row ? this.deserializeGroup(row as Record<string, unknown>) : null;
  }

  async findOldestGlobalSharedByFacility(facilityId: string): Promise<DeviceGroup | null> {
    const knex = this.db.connection;
    const row = await knex('device_groups')
      .where({ facility_id: facilityId, is_global_shared: true })
      .orderBy('created_at', 'asc')
      .first();
    return row ? this.deserializeGroup(row as Record<string, unknown>) : null;
  }

  async clearDefaultFlagForFacility(facilityId: string, exceptGroupId: string): Promise<void> {
    const knex = this.db.connection;
    await knex('device_groups')
      .where({ facility_id: facilityId })
      .whereNot('id', exceptGroupId)
      .update({ is_default: false, updated_at: new Date() });
  }

  async countAccessControlMembershipsForDevice(
    deviceId: string,
    facilityId: string,
    options?: {
      excludeDefault?: boolean;
      excludeGroupId?: string;
      specificGroupsOnly?: boolean;
      deviceType?: DeviceGroupMemberType;
    },
  ): Promise<number> {
    const knex = this.db.connection;
    const query = knex('device_group_members as m')
      .join('device_groups as dg', 'dg.id', 'm.group_id')
      .where('m.device_id', deviceId)
      .andWhere('m.device_type', options?.deviceType ?? 'access_control')
      .andWhere('dg.facility_id', facilityId)
      .andWhere('dg.is_active', true);

    if (options?.specificGroupsOnly) {
      query.andWhere('dg.is_default', false);
      query.andWhere('dg.is_global_shared', false);
    } else if (options?.excludeDefault) {
      query.andWhere('dg.is_default', false);
    }
    if (options?.excludeGroupId) {
      query.andWhereNot('dg.id', options.excludeGroupId);
    }

    const row = await query.count<{ count: string | number }[]>('* as count').first();
    return Number(row?.count ?? 0);
  }

  async getGroupsForDevice(deviceId: string): Promise<DeviceGroup[]> {
    const knex = this.db.connection;
    const rows = await knex('device_groups')
      .select('device_groups.*')
      .join('device_group_members', 'device_groups.id', 'device_group_members.group_id')
      .where('device_group_members.device_id', deviceId)
      .orderBy('device_groups.name', 'asc');
    return rows.map((row) => this.deserializeGroup(row as Record<string, unknown>));
  }

  async getGroupsForBlulokUnit(unitId: string, deviceId?: string | null): Promise<Array<Pick<DeviceGroup, 'id' | 'name' | 'is_default'>>> {
    const knex = this.db.connection;
    const resolvedDeviceId = deviceId ? String(deviceId) : null;

    const query = knex('device_groups as dg')
      .select('dg.id', 'dg.name', 'dg.is_default')
      .join('device_group_members as m', 'm.group_id', 'dg.id')
      .leftJoin('blulok_devices as bd', function joinCurrentLock() {
        this.on('bd.unit_id', '=', 'm.source_unit_id').andOnVal('m.device_type', '=', 'blulok');
      })
      .where('dg.is_active', true)
      .andWhere(function matchMembership() {
        this.where(function unitLinked() {
          this.where('m.device_type', 'blulok').andWhere('m.source_unit_id', unitId);
        });

        if (resolvedDeviceId) {
          // Mirror frontend isDeviceGroupMember: direct device_id match on the member row.
          this.orWhere('m.device_id', resolvedDeviceId);
          // BluLok rows tied to the unit's current lock (handles lock swaps via source_unit_id).
          this.orWhere(function blulokDeviceLinked() {
            this.where('m.device_type', 'blulok').andWhere(function idMatch() {
              this.where('m.device_id', resolvedDeviceId).orWhere('bd.id', resolvedDeviceId);
            });
          });
        }
      })
      .groupBy('dg.id', 'dg.name', 'dg.is_default')
      .orderBy('dg.is_default', 'desc')
      .orderBy('dg.name', 'asc');

    const rows = await query;
    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      is_default: Boolean(row.is_default),
    }));
  }
}

