import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '@/services/database.service';

export type AccessCodeScopeType = 'device_group' | 'device';
export type AccessCodeGeneratedBy = 'system' | 'admin';

export interface AccessCodeConfig {
  id: string;
  facility_id: string;
  is_enabled: boolean;
  digit_count: number;
  rotation_interval_hours: number;
  rotation_hour: number;
  rotation_minute: number;
  created_at: Date;
  updated_at: Date;
}

export interface UpsertAccessCodeConfigData {
  is_enabled?: boolean;
  digit_count?: number;
  rotation_interval_hours?: number;
  rotation_hour?: number;
  rotation_minute?: number;
}

export interface AccessCode {
  id: string;
  facility_id: string;
  scope_type: AccessCodeScopeType;
  scope_id?: string | null;
  schedule_id?: string | null;
  code: string;
  valid_from: Date;
  valid_until: Date;
  is_active: boolean;
  generated_by: AccessCodeGeneratedBy;
  set_by_user_id?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateAccessCodeData {
  facility_id: string;
  scope_type: AccessCodeScopeType;
  scope_id?: string | null;
  schedule_id?: string | null;
  code: string;
  valid_from: Date;
  valid_until: Date;
  generated_by?: AccessCodeGeneratedBy;
  set_by_user_id?: string | null;
}

export interface DeviceCodeResolution {
  device_id: string;
  relay_channel: number;
  code: string;
  valid_from: Date;
  valid_until: Date;
  source_scope_type: AccessCodeScopeType;
  source_scope_id?: string | null;
  schedule_id?: string | null;
}

export class AccessCodeModel {
  private db = DatabaseService.getInstance();

  private buildNewestCodeMap(codes: AccessCode[], scopeType: AccessCodeScopeType): Map<string, AccessCode> {
    const map = new Map<string, AccessCode>();
    for (const code of codes) {
      if (code.scope_type !== scopeType || !code.scope_id) continue;
      // findActive returns newest-first, so keep the first seen per scope.
      if (!map.has(code.scope_id)) {
        map.set(code.scope_id, code);
      }
    }
    return map;
  }

  private buildNewestCodeMapByScopeAndSchedule(
    codes: AccessCode[],
    scopeType: AccessCodeScopeType,
  ): Map<string, AccessCode[]> {
    const newestByScopeAndSchedule = new Map<string, AccessCode>();
    for (const code of codes) {
      if (code.scope_type !== scopeType || !code.scope_id) continue;
      const scheduleKey = code.schedule_id ?? '__NO_SCHEDULE__';
      const key = `${code.scope_id}:${scheduleKey}`;
      // findActive returns newest-first; keep first seen for each scope+schedule tuple.
      if (!newestByScopeAndSchedule.has(key)) {
        newestByScopeAndSchedule.set(key, code);
      }
    }

    const groupedByScope = new Map<string, AccessCode[]>();
    for (const code of newestByScopeAndSchedule.values()) {
      const scopeKey = String(code.scope_id);
      const list = groupedByScope.get(scopeKey) || [];
      list.push(code);
      groupedByScope.set(scopeKey, list);
    }
    return groupedByScope;
  }

  async create(data: CreateAccessCodeData): Promise<AccessCode> {
    const knex = this.db.connection;
    const id = uuidv4();
    await knex('access_codes').insert({
      id,
      facility_id: data.facility_id,
      scope_type: data.scope_type,
      scope_id: data.scope_id ?? null,
      schedule_id: data.schedule_id ?? null,
      code: data.code,
      valid_from: data.valid_from,
      valid_until: data.valid_until,
      generated_by: data.generated_by ?? 'system',
      set_by_user_id: data.set_by_user_id ?? null,
      is_active: true,
    });
    const row = await knex('access_codes').where('id', id).first();
    return row as AccessCode;
  }

  async findActive(
    facilityId: string,
    scopeType?: AccessCodeScopeType,
    scopeId?: string | null,
    scheduleId?: string | null,
  ): Promise<AccessCode[]> {
    const knex = this.db.connection;
    let query = knex('access_codes')
      .where('facility_id', facilityId)
      .andWhere('is_active', true)
      .andWhere('valid_until', '>', knex.fn.now());

    if (scopeType) {
      query = query.andWhere('scope_type', scopeType);
      if (scopeId !== undefined) {
        query = query.andWhere('scope_id', scopeId);
      }
    }
    if (scheduleId !== undefined) {
      query = query.andWhere('schedule_id', scheduleId);
    }

    return query.orderBy('created_at', 'desc');
  }

  async getActiveCodesForFacility(facilityId: string): Promise<AccessCode[]> {
    return this.findActive(facilityId);
  }

  async deactivateForScope(
    facilityId: string,
    scopeType: AccessCodeScopeType,
    scopeId?: string | null,
    scheduleId?: string | null,
  ): Promise<number> {
    const knex = this.db.connection;
    let query = knex('access_codes')
      .where('facility_id', facilityId)
      .andWhere('scope_type', scopeType)
      .andWhere('is_active', true);

    query = query.andWhere('scope_id', scopeId ?? null);
    if (scheduleId !== undefined) {
      query = query.andWhere('schedule_id', scheduleId);
    }

    return query.update({ is_active: false, updated_at: new Date() });
  }

  async getConfig(facilityId: string): Promise<AccessCodeConfig | null> {
    const knex = this.db.connection;
    const row = await knex('access_code_configs').where('facility_id', facilityId).first();
    return (row as AccessCodeConfig) || null;
  }

  async upsertConfig(facilityId: string, config: UpsertAccessCodeConfigData): Promise<AccessCodeConfig> {
    const knex = this.db.connection;
    const existing = await this.getConfig(facilityId);
    if (existing) {
      const updatePayload: Record<string, unknown> = { updated_at: new Date() };
      if (config.is_enabled !== undefined) updatePayload.is_enabled = config.is_enabled;
      if (config.digit_count !== undefined) updatePayload.digit_count = config.digit_count;
      if (config.rotation_interval_hours !== undefined) updatePayload.rotation_interval_hours = config.rotation_interval_hours;
      if (config.rotation_hour !== undefined) updatePayload.rotation_hour = config.rotation_hour;
      if (config.rotation_minute !== undefined) updatePayload.rotation_minute = config.rotation_minute;
      await knex('access_code_configs').where('facility_id', facilityId).update(updatePayload);
    } else {
      await knex('access_code_configs').insert({
        id: uuidv4(),
        facility_id: facilityId,
        is_enabled: config.is_enabled ?? false,
        digit_count: config.digit_count ?? 6,
        rotation_interval_hours: config.rotation_interval_hours ?? 24,
        rotation_hour: config.rotation_hour ?? 0,
        rotation_minute: config.rotation_minute ?? 0,
      });
    }

    const row = await knex('access_code_configs').where('facility_id', facilityId).first();
    return row as AccessCodeConfig;
  }

  async findCodesForDevices(deviceIds: string[]): Promise<DeviceCodeResolution[]> {
    if (deviceIds.length === 0) return [];
    const knex = this.db.connection;

    const deviceRows = await knex('access_control_devices as d')
      .select('d.id as device_id', 'd.relay_channel', 'g.facility_id')
      .join('gateways as g', 'g.id', 'd.gateway_id')
      .whereIn('d.id', deviceIds);

    const devicesByFacility = new Map<string, Array<{ device_id: string; relay_channel: number }>>();
    for (const row of deviceRows) {
      const list = devicesByFacility.get(row.facility_id) || [];
      list.push({ device_id: row.device_id, relay_channel: row.relay_channel });
      devicesByFacility.set(row.facility_id, list);
    }

    const resolved: DeviceCodeResolution[] = [];

    for (const [facilityId, facilityDevices] of devicesByFacility.entries()) {
      const activeCodes = await this.getActiveCodesForFacility(facilityId);
      const deviceCodesBySchedule = this.buildNewestCodeMapByScopeAndSchedule(activeCodes, 'device');

      const groupRows = await knex('device_group_members as dgm')
        .select('dgm.group_id', 'dgm.device_id')
        .join('device_groups as dg', 'dg.id', 'dgm.group_id')
        .whereIn('dgm.device_id', facilityDevices.map((d) => d.device_id))
        .where((qb) => qb.where('dgm.device_type', 'access_control').orWhereNull('dgm.device_type'))
        .andWhere('dg.facility_id', facilityId)
        .andWhere('dg.group_type', 'access_code')
        .andWhere('dg.is_active', true);
      const sortedGroupRows = groupRows
        .filter((row) => row.group_id)
        .sort((a, b) => {
          const left = String(a.group_id);
          const right = String(b.group_id);
          return left.localeCompare(right);
        });
      const groupCodesBySchedule = this.buildNewestCodeMapByScopeAndSchedule(activeCodes, 'device_group');

      const groupByDevice = new Map<string, string[]>();
      for (const row of sortedGroupRows) {
        const groups = groupByDevice.get(row.device_id) || [];
        groups.push(row.group_id);
        groupByDevice.set(row.device_id, groups);
      }

      for (const device of facilityDevices) {
        const groups = groupByDevice.get(device.device_id) || [];
        let hasGroupCodes = false;
        for (const groupId of groups) {
          const groupCodes = (groupCodesBySchedule.get(groupId) || [])
            .slice()
            .sort((left, right) => {
              const leftSchedule = left.schedule_id ?? '';
              const rightSchedule = right.schedule_id ?? '';
              if (leftSchedule !== rightSchedule) return leftSchedule.localeCompare(rightSchedule);
              return String(left.scope_id ?? '').localeCompare(String(right.scope_id ?? ''));
            });
          if (groupCodes.length === 0) continue;
          hasGroupCodes = true;
          groupCodes.forEach((groupCode) => {
            resolved.push({
              device_id: device.device_id,
              relay_channel: device.relay_channel,
              code: groupCode.code,
              valid_from: groupCode.valid_from,
              valid_until: groupCode.valid_until,
              source_scope_type: 'device_group',
              source_scope_id: groupCode.scope_id,
              schedule_id: groupCode.schedule_id ?? null,
            });
          });
        }
        if (hasGroupCodes) {
          continue;
        }

        const directCodes = deviceCodesBySchedule.get(device.device_id) || [];
        if (directCodes.length > 0) {
          directCodes.forEach((directCode) => {
            resolved.push({
              device_id: device.device_id,
              relay_channel: device.relay_channel,
              code: directCode.code,
              valid_from: directCode.valid_from,
              valid_until: directCode.valid_until,
              source_scope_type: 'device',
              source_scope_id: device.device_id,
              schedule_id: directCode.schedule_id ?? null,
            });
          });
          continue;
        }

      }
    }

    return resolved;
  }
}

