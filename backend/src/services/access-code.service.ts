import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { AccessCode, AccessCodeModel, AccessCodeScopeType, DeviceCodeResolution, UpsertAccessCodeConfigData } from '@/models/access-code.model';
import { DeviceGroupModel } from '@/models/device-group.model';
import { ScheduleModel } from '@/models/schedule.model';
import { DatabaseService } from '@/services/database.service';
import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { UserRole } from '@/types/auth.types';
import { AccessDeniedError, AppError, ValidationError } from '@/middleware/error.middleware';
import { logger } from '@/utils/logger';
import { AuthService } from '@/services/auth.service';
import { FacilityAccessService } from '@/services/facility-access.service';
import { ActivityLogModel } from '@/models/activity-log.model';
import type { Knex } from 'knex';
import {
  serializeScheduleForTransport,
  type SerializedSchedule,
  type SerializedScheduleTimeWindow,
} from '@/services/schedules/schedule-serialization.service';
import {
  ACCESS_CODE_PUSH_ACK_TIMEOUT_MS,
} from '@/constants/access-code-push-outbox.constants';
import { AccessCodePushOutboxModel } from '@/models/access-code-push-outbox.model';

type RotationScope = { scopeType: AccessCodeScopeType; scopeId?: string | null; scheduleId?: string | null };

type ScheduleWindowPayload = SerializedScheduleTimeWindow;

export interface UserAccessCodePairing {
  device_id: string;
  access_id: string;
  relay_channel: number;
  facility_id?: string;
  device_name: string;
  device_type: 'gate' | 'elevator' | 'door';
  location_description: string | null;
  code: string;
  valid_from: Date;
  valid_until: Date;
  schedule_id?: string | null;
  schedule_name?: string | null;
  schedule_time_windows?: ScheduleWindowPayload[];
}

type GatewayValidCodeEntry = {
  code: string;
  valid_from: string;
  valid_until: string;
  schedule_id: string | null;
  schedule: SerializedSchedule | null;
  schedule_name: string | null;
  time_windows: ScheduleWindowPayload[];
};

type GatewayDeviceCodeEntry = {
  device_id: string;
  access_id: string;
  relay_channel: number;
  valid_codes: GatewayValidCodeEntry[];
};

export interface EffectiveFacilityAccessCode {
  device_id: string;
  access_id: string;
  device_name: string;
  device_type: 'gate' | 'elevator' | 'door';
  location_description: string | null;
  relay_channel: number;
  code: string;
  valid_from: Date;
  valid_until: Date;
  schedule_id?: string | null;
  schedule_name?: string | null;
  schedule_time_windows?: ScheduleWindowPayload[];
  source_scope_type: AccessCodeScopeType;
  source_scope_id: string | null;
  source_scope_name: string;
}

export interface AccessCodeGroupConfig {
  is_enabled: boolean;
  digit_count: number;
  rotation_interval_hours: number;
  rotation_hour: number;
  rotation_minute: number;
}

export type AccessCodePushStatus = 'pending' | 'active' | 'error';

export interface AccessCodePushState {
  facility_id: string;
  status: AccessCodePushStatus;
  last_error: string | null;
  last_nonce: string | null;
  updated_at: Date;
}

type PendingPushAck = {
  facilityId: string;
  outboxId?: string;
  resolve: () => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export class AccessCodePushDeliveryError extends AppError {
  constructor(message: string) {
    super(message, 503);
    this.name = 'AccessCodePushDeliveryError';
  }
}

export class AccessCodeService {
  private static instance: AccessCodeService;
  private model = new AccessCodeModel();
  private groups = new DeviceGroupModel();
  private activityLogs = new ActivityLogModel();
  private pushOutbox = new AccessCodePushOutboxModel();
  private pushStateByFacility = new Map<string, AccessCodePushState>();
  private pendingPushAcksByNonce = new Map<string, PendingPushAck>();
  private flushInProgressByFacility = new Set<string>();

  // Resolve DB lazily to avoid startup races before DatabaseService.initialize()
  private get db() {
    return DatabaseService.getInstance().connection;
  }

  public static getInstance(): AccessCodeService {
    if (!this.instance) this.instance = new AccessCodeService();
    return this.instance;
  }

  private setPushState(
    facilityId: string,
    status: AccessCodePushStatus,
    lastError: string | null,
    lastNonce: string | null,
  ): AccessCodePushState {
    const next: AccessCodePushState = {
      facility_id: facilityId,
      status,
      last_error: lastError,
      last_nonce: lastNonce,
      updated_at: new Date(),
    };
    this.pushStateByFacility.set(facilityId, next);
    return next;
  }

  public getPushState(facilityId: string): AccessCodePushState {
    const existing = this.pushStateByFacility.get(facilityId);
    if (existing) return existing;
    return this.setPushState(facilityId, 'active', null, null);
  }

  public isGatewayOnline(facilityId: string): boolean {
    const connection = GatewayEventsService.getInstance().getFacilityConnectionStatus(facilityId);
    return connection.connected;
  }

  public handleGatewayAccessCodeUpdateAck(
    facilityId: string,
    ack: { nonce?: string; accepted?: boolean; message?: string },
  ): void {
    const nonce = String(ack?.nonce || '');
    if (!nonce) return;
    const pending = this.pendingPushAcksByNonce.get(nonce);
    if (!pending || pending.facilityId !== facilityId) return;
    clearTimeout(pending.timer);
    this.pendingPushAcksByNonce.delete(nonce);

    const scheduleOutboxRetry = (error?: string) => {
      if (!pending.outboxId) return;
      void this.pushOutbox
        .findById(pending.outboxId)
        .then(async (row) => {
          if (!row) return;
          await this.pushOutbox.scheduleRetry(
            pending.outboxId!,
            error || 'gateway rejected ACCESS_CODE_UPDATE',
            row.attempt_count,
          );
        })
        .catch((err) => {
          logger.warn('[AccessCodePush] Failed to schedule outbox retry after NACK', err);
        });
    };

    if (ack?.accepted === true) {
      pending.resolve();
      return;
    }
    const reason = ack?.message || 'gateway rejected ACCESS_CODE_UPDATE';
    this.setPushState(facilityId, 'error', reason, nonce);
    scheduleOutboxRetry(reason);
    pending.reject(new AccessCodePushDeliveryError(reason));
  }

  private async awaitPushAcceptance(
    facilityId: string,
    nonce: string,
    outboxId?: string,
    timeoutMs = ACCESS_CODE_PUSH_ACK_TIMEOUT_MS,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingPushAcksByNonce.delete(nonce);
        const message = `timed out waiting for gateway acceptance (nonce=${nonce})`;
        this.setPushState(facilityId, 'error', message, nonce);
        if (outboxId) {
          void this.pushOutbox
            .findById(outboxId)
            .then(async (row) => {
              if (!row) return;
              await this.pushOutbox.scheduleRetry(outboxId, message, row.attempt_count);
            })
            .catch((err) => {
              logger.warn('[AccessCodePush] Failed to schedule outbox retry after timeout', err);
            });
        }
        reject(new AccessCodePushDeliveryError(message));
      }, timeoutMs);
      this.pendingPushAcksByNonce.set(nonce, {
        facilityId,
        outboxId,
        resolve,
        reject,
        timer,
      });
    });
  }

  private async restoreActiveCodesSnapshot(
    facilityId: string,
    snapshot: AccessCode[],
  ): Promise<void> {
    await this.db.transaction(async (trx) => {
      await trx('access_codes')
        .where('facility_id', facilityId)
        .andWhere('is_active', true)
        .update({ is_active: false, updated_at: new Date() });

      const snapshotIds = snapshot.map((entry) => entry.id);
      if (snapshotIds.length > 0) {
        await trx('access_codes')
          .whereIn('id', snapshotIds)
          .update({ is_active: true, updated_at: new Date() });
      }

      const groups = await trx('device_groups')
        .select('id')
        .where('facility_id', facilityId)
        .andWhere('group_type', 'access_code');
      for (const group of groups) {
        const groupId = String(group.id);
        const latestAlwaysOn = await trx('access_codes')
          .select('code', 'valid_from', 'valid_until')
          .where('facility_id', facilityId)
          .andWhere('scope_type', 'device_group')
          .andWhere('scope_id', groupId)
          .andWhere('schedule_id', null)
          .andWhere('is_active', true)
          .orderBy('created_at', 'desc')
          .first();
        await trx('device_groups')
          .where('id', groupId)
          .update({
            access_code_current_code: latestAlwaysOn?.code ?? null,
            access_code_current_valid_from: latestAlwaysOn?.valid_from ?? null,
            access_code_current_valid_until: latestAlwaysOn?.valid_until ?? null,
            updated_at: new Date(),
          });
      }
    });
  }

  private async mutateCodesWithPushGuarantee(
    facilityId: string,
    mutate: () => Promise<void>,
  ): Promise<void> {
    await mutate();
    await this.requestGatewayPush(facilityId);
  }

  private sanitizeDigitCount(digitCount: number): number {
    if (!Number.isInteger(digitCount) || digitCount < 3 || digitCount > 8) {
      throw new ValidationError('digit_count must be an integer between 3 and 8');
    }
    return digitCount;
  }

  private validateCode(code: string, digitCount: number): void {
    const pattern = new RegExp(`^[0-9]{${digitCount}}$`);
    if (!pattern.test(code)) {
      throw new ValidationError(`code must be exactly ${digitCount} digits`);
    }
  }

  public generateCode(digitCount: number): string {
    const digits = this.sanitizeDigitCount(digitCount);
    for (let i = 0; i < 20; i += 1) {
      let code = '';
      for (let j = 0; j < digits; j += 1) {
        code += crypto.randomInt(0, 10).toString();
      }

      const allSame = /^(\d)\1+$/.test(code);
      const ascending = '01234567890123456789';
      const descending = '98765432109876543210';
      const sequential = ascending.includes(code) || descending.includes(code);
      if (!allSame && !sequential) return code;
    }

    // Last-resort fallback if all attempts look trivial (extremely unlikely)
    return Array.from({ length: digits }, () => crypto.randomInt(0, 10).toString()).join('');
  }

  public async getConfig(facilityId: string) {
    const config = await this.model.getConfig(facilityId);
    if (config) return config;
    return {
      facility_id: facilityId,
      is_enabled: false,
      digit_count: 6,
      rotation_interval_hours: 24,
      rotation_hour: 0,
      rotation_minute: 0,
    };
  }

  public async upsertConfig(facilityId: string, config: UpsertAccessCodeConfigData) {
    if (config.digit_count !== undefined) this.sanitizeDigitCount(config.digit_count);
    if (config.rotation_hour !== undefined && (config.rotation_hour < 0 || config.rotation_hour > 23)) {
      throw new ValidationError('rotation_hour must be 0-23');
    }
    if (config.rotation_minute !== undefined && (config.rotation_minute < 0 || config.rotation_minute > 59)) {
      throw new ValidationError('rotation_minute must be 0-59');
    }
    if (config.rotation_interval_hours !== undefined && config.rotation_interval_hours <= 0) {
      throw new ValidationError('rotation_interval_hours must be > 0');
    }
    return this.model.upsertConfig(facilityId, config);
  }

  private getDefaultGroupConfig(): AccessCodeGroupConfig {
    return {
      is_enabled: false,
      digit_count: 6,
      rotation_interval_hours: 24,
      rotation_hour: 0,
      rotation_minute: 0,
    };
  }

  private normalizeGroupConfig(input: Partial<AccessCodeGroupConfig>): AccessCodeGroupConfig {
    const merged = { ...this.getDefaultGroupConfig(), ...input };
    if (!Number.isInteger(merged.digit_count) || merged.digit_count < 3 || merged.digit_count > 8) {
      throw new ValidationError('digit_count must be an integer between 3 and 8');
    }
    if (!Number.isFinite(merged.rotation_interval_hours) || merged.rotation_interval_hours <= 0) {
      throw new ValidationError('rotation_interval_hours must be > 0');
    }
    if (!Number.isInteger(merged.rotation_hour) || merged.rotation_hour < 0 || merged.rotation_hour > 23) {
      throw new ValidationError('rotation_hour must be 0-23');
    }
    if (!Number.isInteger(merged.rotation_minute) || merged.rotation_minute < 0 || merged.rotation_minute > 59) {
      throw new ValidationError('rotation_minute must be 0-59');
    }
    return merged;
  }

  private extractGroupConfig(groupSettings?: Record<string, unknown>): AccessCodeGroupConfig {
    const configFromSettings = (groupSettings?.access_code_config || {}) as Partial<AccessCodeGroupConfig>;
    return this.normalizeGroupConfig(configFromSettings);
  }

  public async getGroupConfig(groupId: string): Promise<AccessCodeGroupConfig> {
    const group = await this.groups.findById(groupId);
    if (!group) throw new ValidationError('group not found');
    if (group.group_type !== 'access_code') throw new ValidationError('group must be access_code type');
    return this.extractGroupConfig(group.settings);
  }

  public async upsertGroupConfig(groupId: string, patch: Partial<AccessCodeGroupConfig>): Promise<AccessCodeGroupConfig> {
    const group = await this.groups.findById(groupId);
    if (!group) throw new ValidationError('group not found');
    if (group.group_type !== 'access_code') throw new ValidationError('group must be access_code type');
    const current = this.extractGroupConfig(group.settings);
    const next = this.normalizeGroupConfig({ ...current, ...patch });
    const nextSettings = {
      ...(group.settings || {}),
      access_code_config: next,
    };
    await this.groups.update(groupId, { settings: nextSettings });
    return next;
  }

  public async getGroupFacilityId(groupId: string): Promise<string> {
    const group = await this.groups.findById(groupId);
    if (!group) throw new ValidationError('group not found');
    return group.facility_id;
  }

  private async validateScheduleForFacility(facilityId: string, scheduleId?: string | null): Promise<void> {
    if (!scheduleId) return;
    const schedule = await ScheduleModel.findById(scheduleId);
    if (!schedule) throw new ValidationError('schedule_id does not exist');
    if (schedule.facility_id !== facilityId) {
      throw new AccessDeniedError('schedule does not belong to this facility');
    }
    if (!schedule.is_active) {
      throw new ValidationError('schedule is inactive');
    }
  }

  private async getScheduleMetaMap(
    scheduleIds: Array<string | null | undefined>,
  ): Promise<Map<string, { name: string; schedule: SerializedSchedule }>> {
    const uniqueScheduleIds = Array.from(new Set(scheduleIds.filter((id): id is string => !!id)));
    if (uniqueScheduleIds.length === 0) return new Map();

    const schedules = await this.db('schedules')
      .select('id', 'name', 'facility_id')
      .whereIn('id', uniqueScheduleIds);
    const windows = await this.db('schedule_time_windows')
      .select('schedule_id', 'day_of_week', 'start_time', 'end_time')
      .whereIn('schedule_id', uniqueScheduleIds)
      .orderBy([{ column: 'schedule_id', order: 'asc' }, { column: 'day_of_week', order: 'asc' }, { column: 'start_time', order: 'asc' }]);

    const windowsBySchedule = new Map<string, ScheduleWindowPayload[]>();
    windows.forEach((window) => {
      const scheduleId = String(window.schedule_id);
      const list = windowsBySchedule.get(scheduleId) || [];
      list.push({
        day_of_week: Number(window.day_of_week),
        start_time: String(window.start_time),
        end_time: String(window.end_time),
      });
      windowsBySchedule.set(scheduleId, list);
    });

    const map = new Map<string, { name: string; schedule: SerializedSchedule }>();
    schedules.forEach((row) => {
      const id = String(row.id);
      const serialized = serializeScheduleForTransport({
        facilityId: String(row.facility_id),
        timeWindows: windowsBySchedule.get(id) || [],
      });
      map.set(id, {
        name: String(row.name),
        schedule: serialized,
      });
    });

    return map;
  }

  private pickResolutionForAssignedSchedule(
    resolutions: DeviceCodeResolution[],
    scheduleId?: string | null,
  ): DeviceCodeResolution | null {
    if (resolutions.length === 0) return null;
    if (scheduleId) {
      const scheduled = resolutions.find((entry) => entry.schedule_id === scheduleId);
      return scheduled || null;
    }
    return null;
  }

  private sortResolutionsDeterministically(entries: DeviceCodeResolution[]): DeviceCodeResolution[] {
    return entries.slice().sort((left, right) => {
      const leftScope = String(left.source_scope_id ?? '');
      const rightScope = String(right.source_scope_id ?? '');
      if (leftScope !== rightScope) return leftScope.localeCompare(rightScope);
      const leftSchedule = String(left.schedule_id ?? '');
      const rightSchedule = String(right.schedule_id ?? '');
      if (leftSchedule !== rightSchedule) return leftSchedule.localeCompare(rightSchedule);
      return String(left.code).localeCompare(String(right.code));
    });
  }

  private async getKeypadDeviceIdsForFacility(facilityId: string): Promise<string[]> {
    const rows = await this.db('access_control_devices as d')
      .select('d.id')
      .join('gateways as g', 'g.id', 'd.gateway_id')
      .where('g.facility_id', facilityId)
      .whereRaw(`JSON_CONTAINS(COALESCE(d.access_methods, '["app"]'), '"keypad"')`);
    return rows.map((row) => row.id as string);
  }

  private async getActiveScheduleIdsForFacility(facilityId: string): Promise<string[]> {
    const rows = await this.db('schedules')
      .select('id')
      .where('facility_id', facilityId)
      .andWhere('is_active', true);
    return rows.map((row) => String(row.id));
  }

  private async getRotationScheduleContexts(
    facilityId: string,
    scheduleId?: string | null,
  ): Promise<Array<string | null>> {
    if (scheduleId !== undefined) {
      return [scheduleId ?? null];
    }
    const activeScheduleIds = await this.getActiveScheduleIdsForFacility(facilityId);
    return [null, ...activeScheduleIds];
  }

  private async buildRotationScopes(facilityId: string): Promise<RotationScope[]> {
    const keypadDeviceIds = new Set(await this.getKeypadDeviceIdsForFacility(facilityId));
    if (keypadDeviceIds.size === 0) return [];

    const groups = await this.groups.findByFacility(facilityId, 'access_code');
    const scopes: RotationScope[] = [];
    for (const group of groups) {
      if (!group.is_active) continue;
      const members = await this.groups.getMembers(group.id);
      const hasKeypadMember = members.some(
        (member) =>
          (member.device_type === 'access_control' || !member.device_type) &&
          keypadDeviceIds.has(member.device_id),
      );
      if (!hasKeypadMember) continue;
      scopes.push({ scopeType: 'device_group', scopeId: group.id });
    }
    return scopes;
  }

  private async getGroupScopedConfig(groupId: string): Promise<AccessCodeGroupConfig> {
    const group = await this.groups.findById(groupId);
    if (!group || group.group_type !== 'access_code') {
      throw new ValidationError('device_group scope must reference an access_code group');
    }
    return this.extractGroupConfig(group.settings);
  }

  private async validateScopeTarget(
    facilityId: string,
    scopeType: AccessCodeScopeType,
    scopeId?: string | null,
  ): Promise<void> {
    if (!scopeId) {
      throw new ValidationError(`scope_id is required when scope_type is ${scopeType}`);
    }

    if (scopeType === 'device_group') {
      const group = await this.groups.findById(scopeId);
      if (!group) {
        throw new ValidationError('device_group scope_id does not exist');
      }
      if (group.facility_id !== facilityId) {
        throw new AccessDeniedError('device_group does not belong to this facility');
      }
      if (group.group_type !== 'access_code') {
        throw new ValidationError('device_group scope must reference an access_code group');
      }
      return;
    }

    const device = await this.db('access_control_devices as d')
      .join('gateways as g', 'g.id', 'd.gateway_id')
      .select('g.facility_id')
      .where('d.id', scopeId)
      .first();
    if (!device) {
      throw new ValidationError('device scope_id does not exist');
    }
    if (String(device.facility_id) !== facilityId) {
      throw new AccessDeniedError('device does not belong to this facility');
    }

    const activeMembership = await this.db('device_group_members as gm')
      .join('device_groups as g', 'g.id', 'gm.group_id')
      .select('g.id', 'g.name')
      .where('g.facility_id', facilityId)
      .andWhere('g.group_type', 'access_code')
      .andWhere('g.is_active', true)
      .andWhere('gm.device_type', 'access_control')
      .andWhere('gm.device_id', scopeId)
      .first();
    if (activeMembership) {
      throw new ValidationError(
        `device belongs to access-code group "${String(activeMembership.name)}"; set the group code instead of a device override`,
      );
    }
  }

  private async updateGroupCurrentCodeState(
    trx: Knex.Transaction,
    scopeType: AccessCodeScopeType,
    scopeId: string | null | undefined,
    code: string,
    validFrom: Date,
    validUntil: Date,
  ): Promise<void> {
    if (scopeType !== 'device_group' || !scopeId) return;
    await trx('device_groups')
      .where('id', scopeId)
      .update({
        access_code_current_code: code,
        access_code_current_valid_from: validFrom,
        access_code_current_valid_until: validUntil,
        updated_at: new Date(),
      });
  }

  private async upsertScopeCode(
    facilityId: string,
    scopeType: AccessCodeScopeType,
    scopeId: string | null | undefined,
    scheduleId: string | null | undefined,
    code: string,
    validFrom: Date,
    validUntil: Date,
    generatedBy: 'system' | 'admin' = 'system',
    setByUserId?: string,
  ): Promise<void> {
    const rawScopeKey = `access_code_scope:${facilityId}:${scopeType}:${scopeId ?? 'null'}:${scheduleId ?? 'null'}`;
    const lockKey = `acs:${crypto.createHash('sha256').update(rawScopeKey).digest('hex').slice(0, 48)}`;
    const dbWithRaw = this.db as unknown as { raw?: (...args: unknown[]) => Promise<unknown> };

    const execute = async (): Promise<void> => {
      await this.db.transaction(async (trx) => {
        let deactivateQuery = trx('access_codes')
          .where('facility_id', facilityId)
          .andWhere('scope_type', scopeType)
          .andWhere('is_active', true);

        deactivateQuery = deactivateQuery.andWhere('scope_id', scopeId ?? null);
        deactivateQuery = deactivateQuery.andWhere('schedule_id', scheduleId ?? null);

        await deactivateQuery.update({
          is_active: false,
          updated_at: new Date(),
        });

        await trx('access_codes').insert({
          id: uuidv4(),
          facility_id: facilityId,
          scope_type: scopeType,
          scope_id: scopeId ?? null,
          schedule_id: scheduleId ?? null,
          code,
          valid_from: validFrom,
          valid_until: validUntil,
          is_active: true,
          generated_by: generatedBy,
          set_by_user_id: setByUserId ?? null,
        });

        await this.updateGroupCurrentCodeState(
          trx as unknown as Knex.Transaction,
          scopeType,
          scopeId,
          code,
          validFrom,
          validUntil,
        );
      });
    };

    // Use a DB advisory lock (MySQL GET_LOCK) to serialize writes per scope and avoid racey double-active rows.
    if (typeof dbWithRaw.raw !== 'function') {
      await execute();
      return;
    }

    const acquireResult = await dbWithRaw.raw('SELECT GET_LOCK(?, 10) AS lock_acquired', [lockKey]) as any;
    const acquired = acquireResult?.[0]?.[0]?.lock_acquired ?? acquireResult?.[0]?.lock_acquired;
    if (!acquired) {
      throw new Error(`Failed to acquire access code scope lock for ${lockKey}`);
    }

    try {
      await execute();
    } finally {
      await dbWithRaw.raw('SELECT RELEASE_LOCK(?)', [lockKey]).catch(() => undefined);
    }
  }

  private async createScopeCode(
    facilityId: string,
    scopeType: AccessCodeScopeType,
    scopeId: string | null | undefined,
    scheduleId: string | null | undefined,
    digitCount: number,
    validFrom: Date,
    validUntil: Date,
    generatedBy: 'system' | 'admin' = 'system',
    setByUserId?: string,
  ): Promise<void> {
    await this.upsertScopeCode(
      facilityId,
      scopeType,
      scopeId,
      scheduleId,
      this.generateCode(digitCount),
      validFrom,
      validUntil,
      generatedBy,
      setByUserId,
    );
  }

  public async rotateCodesForFacility(facilityId: string): Promise<void> {
    const keypadDeviceIds = new Set(await this.getKeypadDeviceIdsForFacility(facilityId));
    if (keypadDeviceIds.size === 0) return;
    const groups = await this.groups.findByFacility(facilityId, 'access_code');
    const validFrom = new Date();
    const scopes: RotationScope[] = [];

    await this.mutateCodesWithPushGuarantee(facilityId, async () => {
      for (const group of groups) {
        if (!group.is_active) continue;
        const config = this.extractGroupConfig(group.settings);
        if (!config.is_enabled) continue;
        const members = await this.groups.getMembers(group.id);
        const hasKeypadMember = members.some(
          (member) =>
            (member.device_type === 'access_control' || !member.device_type) &&
            keypadDeviceIds.has(member.device_id),
        );
        if (!hasKeypadMember) continue;
        const scheduleContexts = await this.getRotationScheduleContexts(facilityId);
        for (const scheduleContext of scheduleContexts) {
          await this.createScopeCode(
            facilityId,
            'device_group',
            group.id,
            scheduleContext,
            config.digit_count,
            validFrom,
            new Date(validFrom.getTime() + config.rotation_interval_hours * 60 * 60 * 1000),
            'system',
          );
        }
        scopes.push({ scopeType: 'device_group', scopeId: group.id });
      }
    });

    await this.activityLogs.create({
      entity_type: 'facility',
      entity_id: facilityId,
      activity_type: 'configuration_change',
      title: 'Access codes rotated',
      description: `Rotated access codes for ${scopes.length} scope(s)`,
      actor_type: 'system',
      result: 'success',
      facility_id: facilityId,
    });
    this.notifyAccessCodesChanged(facilityId);
  }

  public async forceRotate(
    facilityId: string,
    scopeType?: AccessCodeScopeType,
    scopeId?: string,
    actorId?: string,
    scheduleId?: string | null,
  ): Promise<void> {
    const config = await this.getConfig(facilityId);
    const validFrom = new Date();
    const validUntil = new Date(validFrom.getTime() + config.rotation_interval_hours * 60 * 60 * 1000);

    await this.mutateCodesWithPushGuarantee(facilityId, async () => {
      if (scopeType) {
        await this.validateScopeTarget(facilityId, scopeType, scopeId ?? null);
        await this.validateScheduleForFacility(facilityId, scheduleId);
        if (scopeType === 'device_group' && scopeId) {
          const groupConfig = await this.getGroupScopedConfig(scopeId);
          const groupValidUntil = new Date(validFrom.getTime() + groupConfig.rotation_interval_hours * 60 * 60 * 1000);
          const scheduleContexts = await this.getRotationScheduleContexts(facilityId, scheduleId);
          for (const scheduleContext of scheduleContexts) {
            await this.createScopeCode(
              facilityId,
              scopeType,
              scopeId ?? null,
              scheduleContext,
              groupConfig.digit_count,
              validFrom,
              groupValidUntil,
              'admin',
              actorId,
            );
          }
        } else {
          await this.createScopeCode(
            facilityId,
            scopeType,
            scopeId ?? null,
            scheduleId ?? null,
            config.digit_count,
            validFrom,
            validUntil,
            'admin',
            actorId,
          );
        }
      } else {
        const scopes = await this.buildRotationScopes(facilityId);
        for (const scope of scopes) {
          if (scope.scopeType === 'device_group' && scope.scopeId) {
            const groupConfig = await this.getGroupScopedConfig(scope.scopeId);
            const groupValidUntil = new Date(validFrom.getTime() + groupConfig.rotation_interval_hours * 60 * 60 * 1000);
            const scheduleContexts = await this.getRotationScheduleContexts(facilityId, scope.scheduleId);
            for (const scheduleContext of scheduleContexts) {
              await this.createScopeCode(
                facilityId,
                scope.scopeType,
                scope.scopeId,
                scheduleContext,
                groupConfig.digit_count,
                validFrom,
                groupValidUntil,
                'admin',
                actorId,
              );
            }
          } else {
            await this.createScopeCode(
              facilityId,
              scope.scopeType,
              scope.scopeId,
              scope.scheduleId ?? null,
              config.digit_count,
              validFrom,
              validUntil,
              'admin',
              actorId,
            );
          }
        }
      }
    });
    this.notifyAccessCodesChanged(facilityId);
  }

  public async setManualCode(
    facilityId: string,
    scopeType: AccessCodeScopeType,
    scopeId: string | null | undefined,
    code: string,
    userId: string,
    scheduleId?: string | null,
  ): Promise<void> {
    await this.validateScopeTarget(facilityId, scopeType, scopeId ?? null);
    await this.validateScheduleForFacility(facilityId, scheduleId);
    const config = scopeType === 'device_group' && scopeId
      ? await this.getGroupScopedConfig(scopeId)
      : await this.getConfig(facilityId);
    this.validateCode(code, config.digit_count);
    const validFrom = new Date();
    const validUntil = new Date(validFrom.getTime() + config.rotation_interval_hours * 60 * 60 * 1000);
    await this.mutateCodesWithPushGuarantee(facilityId, async () => {
      await this.upsertScopeCode(
        facilityId,
        scopeType,
        scopeId ?? null,
        scheduleId ?? null,
        code,
        validFrom,
        validUntil,
        'admin',
        userId,
      );
    });
    this.notifyAccessCodesChanged(facilityId);
  }

  public async getActiveCodesForFacility(facilityId: string, scheduleId?: string | null) {
    await this.validateScheduleForFacility(facilityId, scheduleId);
    if (scheduleId === undefined) {
      return this.model.getActiveCodesForFacility(facilityId);
    }
    return this.model.findActive(facilityId, undefined, undefined, scheduleId ?? null);
  }

  private async getAccessibleFacilityIds(userId: string, userRole: UserRole, _userFacilityIds?: string[]): Promise<string[]> {
    if (AuthService.canAccessAllFacilities(userRole)) {
      const rows = await this.db('facilities').select('id');
      return rows.map((r) => r.id as string);
    }

    return FacilityAccessService.getUserFacilityIds(userId, userRole);
  }

  private async resolvePairingsForDevices(
    devices: Array<{
      id: string;
      facility_id: string;
      name: string;
      device_type: 'gate' | 'elevator' | 'door';
      location_description: string | null;
    }>,
    scheduleByFacility?: Map<string, string | null>,
  ): Promise<UserAccessCodePairing[]> {
    if (devices.length === 0) return [];
    const codesByDevice = await this.model.findCodesForDevices(devices.map((d) => d.id));
    const groupedByDevice = new Map<string, DeviceCodeResolution[]>();
    codesByDevice.forEach((entry) => {
      const list = groupedByDevice.get(entry.device_id) || [];
      list.push(entry);
      groupedByDevice.set(entry.device_id, list);
    });

    const selectedResolutions: DeviceCodeResolution[] = [];
    const pairings: UserAccessCodePairing[] = [];

    devices.forEach((device) => {
      const entries = this.sortResolutionsDeterministically(groupedByDevice.get(device.id) || []);
      if (entries.length === 0) return;

      const hasAssignedScheduleContext = Boolean(scheduleByFacility?.has(device.facility_id));
      const assignedScheduleId = scheduleByFacility?.get(device.facility_id) ?? null;
      if (hasAssignedScheduleContext) {
        const selected = this.pickResolutionForAssignedSchedule(entries, assignedScheduleId);
        if (!selected) return;
        selectedResolutions.push(selected);
        pairings.push({
          device_id: device.id,
          access_id: selected.access_id,
          relay_channel: selected.relay_channel,
          facility_id: device.facility_id,
          device_name: device.name,
          device_type: device.device_type,
          location_description: device.location_description,
          code: selected.code,
          valid_from: selected.valid_from,
          valid_until: selected.valid_until,
          schedule_id: selected.schedule_id ?? null,
        });
        return;
      }

      entries.forEach((entry) => {
        selectedResolutions.push(entry);
        pairings.push({
          device_id: device.id,
          access_id: entry.access_id,
          relay_channel: entry.relay_channel,
          facility_id: device.facility_id,
          device_name: device.name,
          device_type: device.device_type,
          location_description: device.location_description,
          code: entry.code,
          valid_from: entry.valid_from,
          valid_until: entry.valid_until,
          schedule_id: entry.schedule_id ?? null,
        });
      });
    });

    const scheduleMetaById = await this.getScheduleMetaMap(selectedResolutions.map((entry) => entry.schedule_id));
    return pairings.map((pairing) => {
      if (!pairing.schedule_id) return pairing;
      const scheduleMeta = scheduleMetaById.get(pairing.schedule_id);
      if (!scheduleMeta) return pairing;
      return {
        ...pairing,
        schedule_name: scheduleMeta.name,
        schedule_time_windows: scheduleMeta.schedule.time_windows,
      };
    });
  }

  private async getAssignedScheduleByFacility(
    userId: string,
    facilityIds: string[],
  ): Promise<Map<string, string | null>> {
    if (facilityIds.length === 0) return new Map();
    const scheduleByFacility = new Map<string, string | null>(
      facilityIds.map((facilityId) => [facilityId, null]),
    );
    const rows = await this.db('user_facility_schedules')
      .select('facility_id', 'schedule_id')
      .where('user_id', userId)
      .whereIn('facility_id', facilityIds);
    rows.forEach((row) => {
      const facilityId = String(row.facility_id);
      const scheduleId = row.schedule_id ? String(row.schedule_id) : null;
      scheduleByFacility.set(facilityId, scheduleId);
    });
    return scheduleByFacility;
  }

  private async getTenantAccessibleBluLokDeviceIds(
    userId: string,
    targetFacilityIds: string[],
  ): Promise<string[]> {
    if (targetFacilityIds.length === 0) return [];

    const assignedRows = await this.db('unit_assignments as ua')
      .select('bd.id as device_id')
      .join('units as u', 'u.id', 'ua.unit_id')
      .join('blulok_devices as bd', 'bd.unit_id', 'u.id')
      .where('ua.tenant_id', userId)
      .whereIn('u.facility_id', targetFacilityIds)
      .where((qb) => {
        qb.whereNull('ua.access_expires_at').orWhere('ua.access_expires_at', '>', new Date());
      });

    const sharedRows = await this.db('key_sharing as ks')
      .select('bd.id as device_id')
      .join('units as u', 'u.id', 'ks.unit_id')
      .join('blulok_devices as bd', 'bd.unit_id', 'u.id')
      .where('ks.shared_with_user_id', userId)
      .whereIn('u.facility_id', targetFacilityIds)
      .andWhere('ks.is_active', true)
      .where((qb) => {
        qb.whereNull('ks.expires_at').orWhere('ks.expires_at', '>', new Date());
      });

    return Array.from(new Set([...assignedRows, ...sharedRows].map((row) => String(row.device_id))));
  }

  private async getAllKeypadAccessControlDevices(targetFacilityIds: string[]): Promise<Array<{
    id: string;
    facility_id: string;
    name: string;
    device_type: 'gate' | 'elevator' | 'door';
    location_description: string | null;
  }>> {
    if (targetFacilityIds.length === 0) return [];
    const rows = await this.db('access_control_devices as d')
      .select('d.id', 'd.name', 'd.device_type', 'd.location_description', 'g.facility_id')
      .join('gateways as g', 'g.id', 'd.gateway_id')
      .whereIn('g.facility_id', targetFacilityIds)
      .whereRaw(`JSON_CONTAINS(COALESCE(d.access_methods, '["app"]'), '"keypad"')`);
    return rows.map((row) => ({
      id: String(row.id),
      facility_id: String(row.facility_id),
      name: String(row.name),
      device_type: row.device_type as 'gate' | 'elevator' | 'door',
      location_description: (row.location_description as string | null) ?? null,
    }));
  }

  public async getAppCodesForUser(
    userId: string,
    userRole: UserRole,
    userFacilityIds?: string[],
    facilityId?: string,
  ): Promise<UserAccessCodePairing[]> {
    const accessibleFacilityIds = await this.getAccessibleFacilityIds(userId, userRole, userFacilityIds);
    if (facilityId && !accessibleFacilityIds.includes(facilityId) && !AuthService.canAccessAllFacilities(userRole)) {
      throw new AccessDeniedError('Access denied to this facility');
    }
    const targetFacilityIds = facilityId ? [facilityId] : accessibleFacilityIds;
    if (targetFacilityIds.length === 0) return [];

    if (
      userRole === UserRole.ADMIN
      || userRole === UserRole.DEV_ADMIN
      || userRole === UserRole.FACILITY_ADMIN
    ) {
      const allDevices = await this.getAllKeypadAccessControlDevices(targetFacilityIds);
      return this.resolvePairingsForDevices(allDevices);
    }

    const globalRows = await this.db('device_group_members as gm')
      .distinct('d.id', 'd.name', 'd.device_type', 'd.location_description', 'g.facility_id')
      .join('device_groups as g', 'g.id', 'gm.group_id')
      .join('access_control_devices as d', 'd.id', 'gm.device_id')
      .join('gateways as gw', 'gw.id', 'd.gateway_id')
      .whereIn('g.facility_id', targetFacilityIds)
      .where('g.group_type', 'access_code')
      .andWhere('g.is_global_shared', true)
      .andWhere('g.is_active', true)
      .andWhere('gm.device_type', 'access_control')
      .whereRaw(`JSON_CONTAINS(COALESCE(d.access_methods, '["app"]'), '"keypad"')`);

    const accessibleBluLokDeviceIds = await this.getTenantAccessibleBluLokDeviceIds(userId, targetFacilityIds);
    let scopedRows: Array<Record<string, unknown>> = [];
    if (accessibleBluLokDeviceIds.length > 0) {
      scopedRows = await this.db('device_group_members as access_members')
        .distinct('d.id', 'd.name', 'd.device_type', 'd.location_description', 'g.facility_id')
        .join('device_groups as g', 'g.id', 'access_members.group_id')
        .join('device_group_members as user_members', 'user_members.group_id', 'g.id')
        .join('access_control_devices as d', 'd.id', 'access_members.device_id')
        .join('gateways as gw', 'gw.id', 'd.gateway_id')
        .whereIn('g.facility_id', targetFacilityIds)
        .where('g.group_type', 'access_code')
        .andWhere('g.is_active', true)
        .andWhere('access_members.device_type', 'access_control')
        .andWhere('user_members.device_type', 'blulok')
        .whereIn('user_members.device_id', accessibleBluLokDeviceIds)
        .whereRaw(`JSON_CONTAINS(COALESCE(d.access_methods, '["app"]'), '"keypad"')`);
    }

    const byId = new Map<string, {
      id: string;
      facility_id: string;
      name: string;
      device_type: 'gate' | 'elevator' | 'door';
      location_description: string | null;
    }>();
    [...globalRows, ...scopedRows].forEach((row) => {
      const id = String(row.id);
      if (!byId.has(id)) {
        byId.set(id, {
          id,
          facility_id: String(row.facility_id),
          name: String(row.name),
          device_type: row.device_type as 'gate' | 'elevator' | 'door',
          location_description: (row.location_description as string | null) ?? null,
        });
      }
    });

    const scheduleByFacility = await this.getAssignedScheduleByFacility(userId, targetFacilityIds);
    return this.resolvePairingsForDevices(Array.from(byId.values()), scheduleByFacility);
  }

  public async getCodesForUser(
    userId: string,
    userRole: UserRole,
    userFacilityIds?: string[],
    facilityId?: string,
  ): Promise<UserAccessCodePairing[]> {
    return this.getAppCodesForUser(userId, userRole, userFacilityIds, facilityId);
  }

  public async getGatewayPollPayload(facilityId: string): Promise<DeviceCodeResolution[]> {
    const deviceIds = await this.getKeypadDeviceIdsForFacility(facilityId);
    return this.model.findCodesForDevices(deviceIds);
  }

  public async getEffectiveCodesForFacility(
    facilityId: string,
    scheduleId?: string | null,
  ): Promise<EffectiveFacilityAccessCode[]> {
    await this.validateScheduleForFacility(facilityId, scheduleId);
    const devices = await this.db('access_control_devices as d')
      .select(
        'd.id',
        'd.name',
        'd.device_type',
        'd.location_description',
        'd.relay_channel',
      )
      .join('gateways as g', 'g.id', 'd.gateway_id')
      .where('g.facility_id', facilityId)
      .whereRaw(`JSON_CONTAINS(COALESCE(d.access_methods, '["app"]'), '"keypad"')`)
      .orderBy('d.name', 'asc');

    if (devices.length === 0) return [];

    const resolved = await this.model.findCodesForDevices(devices.map((d) => d.id as string));
    const byDevice = new Map<string, DeviceCodeResolution[]>();
    resolved.forEach((entry) => {
      const list = byDevice.get(entry.device_id) || [];
      list.push(entry);
      byDevice.set(entry.device_id, list);
    });

    const groupIds = Array.from(
      new Set(
        resolved
          .filter((entry) => entry.source_scope_type === 'device_group' && entry.source_scope_id)
          .map((entry) => entry.source_scope_id as string),
      ),
    );
    const groupRows = groupIds.length
      ? await this.db('device_groups').select('id', 'name').whereIn('id', groupIds)
      : [];
    const groupNameById = new Map<string, string>(groupRows.map((row) => [String(row.id), String(row.name)]));
    const filteredResolved = scheduleId === undefined
      ? resolved
      : resolved.filter((entry) => (scheduleId ? entry.schedule_id === scheduleId : !entry.schedule_id));
    const scheduleMetaById = await this.getScheduleMetaMap(filteredResolved.map((entry) => entry.schedule_id));

    const result: EffectiveFacilityAccessCode[] = [];
    devices.forEach((device) => {
      const entries = (byDevice.get(String(device.id)) || []).filter((entry) => {
        if (scheduleId === undefined) return true;
        return scheduleId ? entry.schedule_id === scheduleId : !entry.schedule_id;
      });
      entries.forEach((entry) => {
        const sourceScopeName = entry.source_scope_type === 'device_group'
          ? (groupNameById.get(String(entry.source_scope_id)) || 'Group Code')
          : String(device.name);
        const scheduleMeta = entry.schedule_id ? scheduleMetaById.get(entry.schedule_id) : undefined;

        result.push({
          device_id: String(device.id),
          access_id: entry.access_id,
          device_name: String(device.name),
          device_type: device.device_type as 'gate' | 'elevator' | 'door',
          location_description: (device.location_description as string | null) ?? null,
          relay_channel: Number(device.relay_channel),
          code: entry.code,
          valid_from: entry.valid_from,
          valid_until: entry.valid_until,
          schedule_id: entry.schedule_id ?? null,
          schedule_name: scheduleMeta?.name ?? null,
          schedule_time_windows: scheduleMeta?.schedule.time_windows || [],
          source_scope_type: entry.source_scope_type,
          source_scope_id: entry.source_scope_id ?? null,
          source_scope_name: sourceScopeName,
        });
      });
    });

    return result;
  }

  /**
   * Queue a facility access-code push and attempt immediate delivery when the gateway is online.
   * Unsent pushes persist in access_code_push_outbox until ACK or dead_letter.
   */
  public async requestGatewayPush(facilityId: string): Promise<void> {
    await this.pushOutbox.enqueue(facilityId);
    await this.flushPendingPushForFacility(facilityId);
  }

  /**
   * Deliver the oldest pending outbox row for a facility (if gateway is online).
   */
  public async flushPendingPushForFacility(facilityId: string): Promise<void> {
    if (this.flushInProgressByFacility.has(facilityId)) {
      return;
    }
    if (!this.isGatewayOnline(facilityId)) {
      this.setPushState(facilityId, 'pending', null, null);
      return;
    }

    const row = await this.pushOutbox.findActiveForFacility(facilityId);
    if (!row || row.status === 'in_progress') {
      return;
    }

    this.flushInProgressByFacility.add(facilityId);
    try {
      await this.deliverOutboxRow(row);
    } finally {
      this.flushInProgressByFacility.delete(facilityId);
    }

    const remaining = await this.pushOutbox.findActiveForFacility(facilityId);
    if (remaining && remaining.status !== 'in_progress' && this.isGatewayOnline(facilityId)) {
      await this.flushPendingPushForFacility(facilityId);
    }
  }

  /** Scan due outbox rows across facilities (called from scheduler). */
  public async processDueOutboxPushes(limit = 20): Promise<void> {
    await this.pushOutbox.recoverStaleInProgress();
    const due = await this.pushOutbox.findDue(limit);
    for (const row of due) {
      if (!this.isGatewayOnline(row.facility_id)) {
        continue;
      }
      try {
        await this.flushPendingPushForFacility(row.facility_id);
      } catch (error) {
        logger.warn(
          `[AccessCodePush] Outbox flush failed for facility=${row.facility_id}`,
          error,
        );
      }
    }
  }

  public async hasPendingOutboxPush(facilityId: string): Promise<boolean> {
    return this.pushOutbox.hasPendingForFacility(facilityId);
  }

  private async deliverOutboxRow(row: { id: string; facility_id: string; attempt_count: number }): Promise<void> {
    const facilityId = row.facility_id;
    const nonce = crypto.randomUUID();
    await this.pushOutbox.markInProgress(row.id, nonce);
    this.setPushState(facilityId, 'pending', null, nonce);

    const jwt = await this.buildAccessCodeUpdateJwt(facilityId, nonce);
    GatewayEventsService.getInstance().unicastToFacility(facilityId, jwt);
    logger.info(
      `Access code push dispatched for facility=${facilityId} outbox=${row.id} nonce=${nonce} attempt=${row.attempt_count + 1}`,
    );

    try {
      await this.awaitPushAcceptance(facilityId, nonce, row.id);
      await this.pushOutbox.markDelivered(row.id);
      this.setPushState(facilityId, 'active', null, nonce);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Access code push delivery failed for facility=${facilityId}: ${message}`);
      throw error;
    }
  }

  private async buildAccessCodeUpdateJwt(facilityId: string, nonce: string): Promise<string> {
    const payload = await this.getGatewayPollPayload(facilityId);
    const scheduleMetaById = await this.getScheduleMetaMap(payload.map((entry) => entry.schedule_id));
    const codesByDevice = new Map<string, GatewayDeviceCodeEntry>();

    this.sortResolutionsDeterministically(payload).forEach((entry) => {
      const scheduleMeta = entry.schedule_id ? (scheduleMetaById.get(entry.schedule_id) ?? null) : null;
      const validCode: GatewayValidCodeEntry = {
        code: entry.code,
        valid_from: entry.valid_from instanceof Date ? entry.valid_from.toISOString() : String(entry.valid_from),
        valid_until: entry.valid_until instanceof Date ? entry.valid_until.toISOString() : String(entry.valid_until),
        schedule_id: entry.schedule_id ?? null,
        schedule: scheduleMeta?.schedule ?? null,
        schedule_name: scheduleMeta?.name ?? null,
        time_windows: scheduleMeta?.schedule.time_windows || [],
      };

      const existing = codesByDevice.get(entry.device_id);
      if (!existing) {
        codesByDevice.set(entry.device_id, {
          device_id: entry.device_id,
          access_id: entry.access_id,
          relay_channel: entry.relay_channel,
          valid_codes: [validCode],
        });
        return;
      }

      existing.valid_codes.push(validCode);
    });

    const jwtPayload = {
      cmd_type: 'ACCESS_CODE_UPDATE',
      facility_id: facilityId,
      nonce,
      codes: Array.from(codesByDevice.values()),
    };
    return Ed25519Service.signCommandJwt(jwtPayload);
  }

  public async pushCodesToGateway(facilityId: string): Promise<void> {
    await this.requestGatewayPush(facilityId);
  }

  private notifyAccessCodesChanged(facilityId: string): void {
    void (async () => {
      try {
        const { WebSocketService } = await import('@/services/websocket.service');
        await WebSocketService.getInstance().broadcastAccessCodesUpdate(facilityId);
      } catch (err) {
        logger.warn(`Failed to broadcast access codes update for facility=${facilityId}`, err);
      }
    })();
  }
}

