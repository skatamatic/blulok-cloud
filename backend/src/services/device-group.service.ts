import {
  CreateDeviceGroupData,
  DeviceGroup,
  DeviceGroupMember,
  DeviceGroupMemberType,
  DeviceGroupType,
  DeviceGroupModel,
  UpdateDeviceGroupData,
} from '@/models/device-group.model';
import { ActivityLogModel } from '@/models/activity-log.model';
import { AccessDeniedError, NotFoundError, ValidationError } from '@/middleware/error.middleware';
import { AuthService } from '@/services/auth.service';
import { DatabaseService } from '@/services/database.service';
import { AccessCodeService } from '@/services/access-code.service';
import { UserRole } from '@/types/auth.types';

interface ActorContext {
  actorId?: string;
  actorName?: string;
}

export class DeviceGroupService {
  private static instance: DeviceGroupService;
  private model = new DeviceGroupModel();
  private activityLogs = new ActivityLogModel();
  private get db() {
    return DatabaseService.getInstance().connection;
  }

  public static getInstance(): DeviceGroupService {
    if (!this.instance) this.instance = new DeviceGroupService();
    return this.instance;
  }

  private assertFacilityAccess(userRole: UserRole, userFacilityIds: string[] | undefined, facilityId: string): void {
    if (AuthService.canAccessAllFacilities(userRole)) return;
    if (!userFacilityIds?.includes(facilityId)) {
      throw new AccessDeniedError('Access denied to this facility');
    }
  }

  private async getGroupOrThrow(id: string): Promise<DeviceGroup> {
    const group = await this.model.findById(id);
    if (!group) throw new NotFoundError('Device group');
    return group;
  }

  private async assertDeviceInFacility(deviceId: string, facilityId: string, deviceType: DeviceGroupMemberType): Promise<void> {
    if (deviceType === 'access_control') {
      const row = await this.db('access_control_devices as d')
        .join('gateways as g', 'g.id', 'd.gateway_id')
        .select('g.facility_id')
        .where('d.id', deviceId)
        .first();
      if (!row) throw new NotFoundError('Access control device');
      if (String(row.facility_id) !== facilityId) {
        throw new AccessDeniedError('Device does not belong to the group facility');
      }
      return;
    }

    const row = await this.db('blulok_devices as d')
      .join('gateways as g', 'g.id', 'd.gateway_id')
      .select('g.facility_id')
      .where('d.id', deviceId)
      .first();
    if (!row) throw new NotFoundError('BluLok device');
    if (String(row.facility_id) !== facilityId) {
      throw new AccessDeniedError('Device does not belong to the group facility');
    }
  }

  private async assertUnitInFacility(unitId: string, facilityId: string): Promise<void> {
    const row = await this.db('units')
      .select('facility_id')
      .where('id', unitId)
      .first();
    if (!row) throw new NotFoundError('Unit');
    if (String(row.facility_id) !== facilityId) {
      throw new AccessDeniedError('Unit does not belong to the group facility');
    }
  }

  private async assertGlobalSharedConstraint(groupType: DeviceGroupType, isGlobalShared: boolean): Promise<void> {
    if (groupType !== 'access_code' && isGlobalShared) {
      throw new ValidationError('is_global_shared is only valid for access_code groups');
    }
  }

  private async hasGlobalSharedAccessCodeGroup(facilityId: string, excludeGroupId?: string): Promise<boolean> {
    const existing = await this.db('device_groups')
      .select('id')
      .where('facility_id', facilityId)
      .andWhere('group_type', 'access_code')
      .andWhere('is_global_shared', true)
      .modify((qb) => {
        if (excludeGroupId) qb.andWhereNot('id', excludeGroupId);
      })
      .first();
    return Boolean(existing);
  }

  private async promoteGlobalSharedGroup(facilityId: string, groupId: string): Promise<void> {
    const now = new Date();
    await this.db('device_groups')
      .where('facility_id', facilityId)
      .andWhere('group_type', 'access_code')
      .andWhere('is_global_shared', true)
      .andWhereNot('id', groupId)
      .update({
        is_global_shared: false,
        updated_at: now,
      });

    await this.db('device_groups')
      .where('id', groupId)
      .update({
        is_global_shared: true,
        updated_at: now,
      });
  }

  private async logGroupActivity(
    group: DeviceGroup,
    title: string,
    description: string,
    actor: ActorContext,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.activityLogs.create({
      entity_type: 'facility',
      entity_id: group.facility_id,
      activity_type: 'configuration_change',
      title,
      description,
      actor_type: actor.actorId ? 'user' : 'system',
      actor_id: actor.actorId,
      actor_name: actor.actorName,
      result: 'success',
      facility_id: group.facility_id,
      metadata: {
        groupId: group.id,
        ...metadata,
      },
    });
  }

  async create(
    data: CreateDeviceGroupData,
    userRole: UserRole,
    userFacilityIds: string[] | undefined,
    actor: ActorContext = {},
  ): Promise<DeviceGroup> {
    this.assertFacilityAccess(userRole, userFacilityIds, data.facility_id);
    const groupType = data.group_type || 'zone';
    const requestedGlobal = Boolean(data.is_global_shared);
    await this.assertGlobalSharedConstraint(groupType, requestedGlobal);
    const hadGlobalBeforeCreate = groupType === 'access_code'
      ? await this.hasGlobalSharedAccessCodeGroup(data.facility_id)
      : false;

    const group = await this.model.create({
      ...data,
      is_global_shared: groupType === 'access_code' ? requestedGlobal : false,
    });

    if (groupType === 'access_code' && (requestedGlobal || !hadGlobalBeforeCreate)) {
      await this.promoteGlobalSharedGroup(group.facility_id, group.id);
    }

    const hydratedGroup = await this.getGroupOrThrow(group.id);
    await this.logGroupActivity(
      hydratedGroup,
      'Device group created',
      `Created device group "${hydratedGroup.name}"`,
      actor,
    );
    return hydratedGroup;
  }

  async findByFacility(
    facilityId: string,
    userRole: UserRole,
    userFacilityIds: string[] | undefined,
    groupType?: DeviceGroupType,
  ): Promise<DeviceGroup[]> {
    this.assertFacilityAccess(userRole, userFacilityIds, facilityId);
    return this.model.findByFacility(facilityId, groupType);
  }

  async findById(
    id: string,
    userRole: UserRole,
    userFacilityIds: string[] | undefined,
  ): Promise<DeviceGroup> {
    const group = await this.getGroupOrThrow(id);
    this.assertFacilityAccess(userRole, userFacilityIds, group.facility_id);
    return group;
  }

  async update(
    id: string,
    data: UpdateDeviceGroupData,
    userRole: UserRole,
    userFacilityIds: string[] | undefined,
    actor: ActorContext = {},
  ): Promise<DeviceGroup> {
    const existing = await this.getGroupOrThrow(id);
    this.assertFacilityAccess(userRole, userFacilityIds, existing.facility_id);
    const nextGroupType = data.group_type ?? existing.group_type;
    const nextIsGlobalShared = data.is_global_shared ?? existing.is_global_shared;
    await this.assertGlobalSharedConstraint(nextGroupType, Boolean(nextIsGlobalShared));

    const hadGlobalBeforeUpdate = nextGroupType === 'access_code'
      ? await this.hasGlobalSharedAccessCodeGroup(existing.facility_id, existing.id)
      : false;

    const globalSnapshot = await this.db('device_groups')
      .select('id', 'is_global_shared')
      .where('facility_id', existing.facility_id)
      .andWhere('group_type', 'access_code');
    const rollbackGroupState: UpdateDeviceGroupData = {
      group_type: existing.group_type,
      is_global_shared: existing.is_global_shared,
      name: existing.name,
      description: existing.description,
      settings: existing.settings,
      metadata: existing.metadata,
      is_active: existing.is_active,
      access_code_current_code: existing.access_code_current_code ?? null,
      access_code_current_valid_from: existing.access_code_current_valid_from ?? null,
      access_code_current_valid_until: existing.access_code_current_valid_until ?? null,
    };

    const updated = await this.model.update(id, {
      ...data,
      is_global_shared: nextGroupType === 'access_code' ? data.is_global_shared : false,
    });
    if (!updated) throw new NotFoundError('Device group');

    if (nextGroupType === 'access_code' && (Boolean(data.is_global_shared) || !hadGlobalBeforeUpdate)) {
      await this.promoteGlobalSharedGroup(updated.facility_id, updated.id);
    }

    const hydratedUpdated = await this.getGroupOrThrow(updated.id);
    const shouldRefreshGatewayCodes = (
      (data.is_active !== undefined || data.group_type !== undefined)
      && (existing.group_type === 'access_code' || hydratedUpdated.group_type === 'access_code')
    );
    if (shouldRefreshGatewayCodes) {
      try {
        await AccessCodeService.getInstance().pushCodesToGateway(hydratedUpdated.facility_id);
      } catch (pushError) {
        // Keep update behavior atomic for callers: rollback persisted DB changes when push fails.
        await this.model.update(existing.id, rollbackGroupState);
        await Promise.all(
          globalSnapshot.map((row) =>
            this.db('device_groups')
              .where('id', String(row.id))
              .update({ is_global_shared: Boolean(row.is_global_shared), updated_at: new Date() }),
          ),
        );
        throw pushError;
      }
    }
    await this.logGroupActivity(
      hydratedUpdated,
      'Device group updated',
      `Updated device group "${hydratedUpdated.name}"`,
      actor,
      { updatedFields: Object.keys(data) },
    );
    return hydratedUpdated;
  }

  async delete(
    id: string,
    userRole: UserRole,
    userFacilityIds: string[] | undefined,
    actor: ActorContext = {},
  ): Promise<void> {
    const group = await this.getGroupOrThrow(id);
    this.assertFacilityAccess(userRole, userFacilityIds, group.facility_id);
    await this.model.delete(id);
    if (group.group_type === 'access_code') {
      await AccessCodeService.getInstance().pushCodesToGateway(group.facility_id);
    }
    await this.logGroupActivity(
      group,
      'Device group deleted',
      `Deleted device group "${group.name}"`,
      actor,
    );
  }

  async addMember(
    groupId: string,
    deviceId: string | undefined,
    deviceType: DeviceGroupMemberType,
    sourceUnitId: string | undefined,
    userRole: UserRole,
    userFacilityIds: string[] | undefined,
    actor: ActorContext = {},
  ): Promise<DeviceGroupMember> {
    const group = await this.getGroupOrThrow(groupId);
    this.assertFacilityAccess(userRole, userFacilityIds, group.facility_id);
    let resolvedDeviceId = deviceId;

    if (sourceUnitId) {
      if (deviceType !== 'blulok') {
        throw new ValidationError('unit_id can only be used with blulok device_type');
      }
      await this.assertUnitInFacility(sourceUnitId, group.facility_id);
      const boundDevice = await this.db('blulok_devices')
        .select('id')
        .where('unit_id', sourceUnitId)
        .first();
      if (!boundDevice) {
        throw new NotFoundError('BluLok device for unit');
      }
      resolvedDeviceId = String(boundDevice.id);
    }

    if (!resolvedDeviceId) {
      throw new NotFoundError('Device');
    }

    await this.assertDeviceInFacility(resolvedDeviceId, group.facility_id, deviceType);
    const member = await this.model.addMember(groupId, resolvedDeviceId, deviceType, sourceUnitId);
    if (group.group_type === 'access_code' && deviceType === 'access_control') {
      await AccessCodeService.getInstance().pushCodesToGateway(group.facility_id);
    }
    await this.logGroupActivity(
      group,
      'Device added to group',
      `Added device ${resolvedDeviceId} to group "${group.name}"`,
      actor,
      { deviceId: resolvedDeviceId, deviceType, sourceUnitId: sourceUnitId || null },
    );
    return member;
  }

  async removeMember(
    groupId: string,
    deviceId: string,
    deviceType: DeviceGroupMemberType | undefined,
    userRole: UserRole,
    userFacilityIds: string[] | undefined,
    actor: ActorContext = {},
  ): Promise<void> {
    const group = await this.getGroupOrThrow(groupId);
    this.assertFacilityAccess(userRole, userFacilityIds, group.facility_id);
    await this.model.removeMember(groupId, deviceId, deviceType);
    if (group.group_type === 'access_code' && (deviceType === 'access_control' || !deviceType)) {
      await AccessCodeService.getInstance().pushCodesToGateway(group.facility_id);
    }
    await this.logGroupActivity(
      group,
      'Device removed from group',
      `Removed device ${deviceId} from group "${group.name}"`,
      actor,
      { deviceId, deviceType: deviceType || 'any' },
    );
  }

  async getMembers(
    groupId: string,
    userRole: UserRole,
    userFacilityIds: string[] | undefined,
  ): Promise<DeviceGroupMember[]> {
    const group = await this.getGroupOrThrow(groupId);
    this.assertFacilityAccess(userRole, userFacilityIds, group.facility_id);
    return this.model.getMembers(groupId);
  }
}

