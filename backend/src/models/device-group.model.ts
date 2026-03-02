import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '@/services/database.service';

export type DeviceGroupMemberType = 'access_control' | 'blulok';
export type DeviceGroupType = 'zone' | 'access_code';

export interface DeviceGroup {
  id: string;
  facility_id: string;
  group_type: DeviceGroupType;
  is_global_shared: boolean;
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
  name: string;
  description?: string;
  settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateDeviceGroupData {
  group_type?: DeviceGroupType;
  is_global_shared?: boolean;
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
    const rows = await query.orderBy('name', 'asc');
    return rows.map((row) => this.deserializeGroup(row as Record<string, unknown>));
  }

  async update(id: string, data: UpdateDeviceGroupData): Promise<DeviceGroup | null> {
    const knex = this.db.connection;
    const payload: Record<string, unknown> = { updated_at: new Date() };
    if (data.name !== undefined) payload.name = data.name;
    if (data.group_type !== undefined) payload.group_type = data.group_type;
    if (data.is_global_shared !== undefined) payload.is_global_shared = Boolean(data.is_global_shared);
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
    const query = knex('device_group_members')
      .where('group_id', groupId)
      .andWhere('device_id', deviceId);

    if (deviceType === 'blulok') {
      const device = await knex('blulok_devices').select('unit_id').where('id', deviceId).first();
      if (device?.unit_id) {
        query.orWhere((qb) => {
          qb.where('group_id', groupId).andWhere('source_unit_id', String(device.unit_id));
        });
      }
    }

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

  async syncUnitLinkedMembers(unitId: string, deviceId: string): Promise<number> {
    const knex = this.db.connection;
    return knex('device_group_members')
      .where('source_unit_id', unitId)
      .andWhere('device_type', 'blulok')
      .update({ device_id: deviceId });
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
}

