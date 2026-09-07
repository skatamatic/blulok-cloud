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
import { DEFAULT_ACCESS_GROUP_NAME, LEGACY_DEFAULT_ACCESS_GROUP_NAMES } from '@/constants/access-group.constants';
import { logger } from '@/utils/logger';

interface ActorContext {
  actorId?: string;
  actorName?: string;
}

export type DeviceGroupUserAccessReason =
  | 'primary_tenant'
  | 'assigned_tenant'
  | 'shared_key';

const GROUP_ACCESS_EXCLUDED_USER_ROLES = [
  UserRole.ADMIN,
  UserRole.DEV_ADMIN,
  UserRole.FACILITY_ADMIN,
];

export interface DeviceGroupUserAccess {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: UserRole;
  access_reasons: DeviceGroupUserAccessReason[];
  unit_numbers: string[];
}

export interface UnknownDefaultGroupMemberCleanupResult {
  removed: number;
  byFacility: Record<string, number>;
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

  /**
   * Removes orphaned access-group memberships (missing AC devices / BluLok locks or units).
   * Safe to run on every startup — idempotent.
   */
  async cleanupUnknownDefaultGroupMembers(): Promise<UnknownDefaultGroupMemberCleanupResult> {
    return this.model.removeOrphanedGroupMembers();
  }

  static async cleanupUnknownDefaultGroupMembersOnStartup(): Promise<void> {
    try {
      const result = await DeviceGroupService.getInstance().cleanupUnknownDefaultGroupMembers();
      if (result.removed > 0) {
        logger.info(
          `Removed ${result.removed} orphaned access-group member(s)`,
          { byFacility: result.byFacility },
        );
      }
    } catch (error) {
      logger.warn('Access-group orphan membership cleanup failed (non-fatal):', error);
    }
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

  private assertDefaultGroupProtected(group: DeviceGroup, data?: UpdateDeviceGroupData): void {
    if (!group.is_default) return;

    if (data?.name !== undefined && data.name !== group.name && data.name !== DEFAULT_ACCESS_GROUP_NAME) {
      throw new ValidationError('The default access group cannot be renamed');
    }
    if (data?.is_default === false) {
      throw new ValidationError('The default access group cannot be unset');
    }
    if (data?.is_active === false) {
      throw new ValidationError('The default access group cannot be deactivated');
    }
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

  private async pushCodesIfAccessControlChanged(facilityId: string, deviceType: DeviceGroupMemberType | undefined): Promise<void> {
    if (deviceType === 'access_control' || !deviceType) {
      await AccessCodeService.getInstance().pushCodesToGateway(facilityId);
    }
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

  /**
   * Resolve which group row should be the single facility default (legacy names, existing default, etc.).
   */
  private async resolveDefaultGroupCandidate(facilityId: string): Promise<DeviceGroup | null> {
    for (const legacyName of LEGACY_DEFAULT_ACCESS_GROUP_NAMES) {
      const legacy = await this.model.findByFacilityAndName(facilityId, legacyName);
      if (legacy) return legacy;
    }

    return this.model.findDefaultByFacility(facilityId);
  }

  private async normalizeDefaultGroup(
    facilityId: string,
    groupId: string,
    actor: ActorContext,
    options?: { logCreation?: boolean },
  ): Promise<DeviceGroup> {
    await this.model.clearDefaultFlagForFacility(facilityId, groupId);

    const updated = await this.model.update(groupId, {
      is_default: true,
      is_active: true,
      group_type: 'access_code',
      name: DEFAULT_ACCESS_GROUP_NAME,
      description: 'Default access group — all tenants in this facility',
    });
    if (!updated) throw new NotFoundError('Device group');

    if (options?.logCreation) {
      await this.logGroupActivity(
        updated,
        'Default access group created',
        `Created default access group "${updated.name}"`,
        actor,
      );
    }

    return updated;
  }

  /**
   * Idempotently ensure exactly one canonical default access group per facility.
   * Promotes legacy/global groups (e.g. "free"), clears duplicate defaults, and normalizes the name.
   */
  async ensureDefaultGroup(facilityId: string, actor: ActorContext = {}): Promise<DeviceGroup> {
    const candidate = await this.resolveDefaultGroupCandidate(facilityId);

    if (candidate) {
      const needsRepair =
        !candidate.is_default
        || candidate.name !== DEFAULT_ACCESS_GROUP_NAME
        || candidate.group_type !== 'access_code';

      if (needsRepair || (await this.model.countDefaultGroupsForFacility(facilityId)) > 1) {
        return this.normalizeDefaultGroup(facilityId, candidate.id, actor);
      }

      await this.model.clearDefaultFlagForFacility(facilityId, candidate.id);
      return candidate;
    }

    const group = await this.model.create({
      facility_id: facilityId,
      group_type: 'access_code',
      is_default: true,
      name: DEFAULT_ACCESS_GROUP_NAME,
      description: 'Default access group — all tenants in this facility',
    });

    await this.logGroupActivity(
      group,
      'Default access group created',
      `Created default access group "${group.name}"`,
      actor,
    );

    return group;
  }

  /**
   * Assign a device (access-control or blulok) to the facility default group.
   * Every device belongs to the default group unless it has been moved into a
   * specific (non-default) group, which takes precedence.
   */
  private async assignDeviceToDefaultGroup(
    facilityId: string,
    deviceId: string,
    deviceType: DeviceGroupMemberType,
    actor: ActorContext = {},
  ): Promise<void> {
    const defaultGroup = await this.ensureDefaultGroup(facilityId, actor);

    const inSpecificGroup = await this.model.countAccessControlMembershipsForDevice(
      deviceId,
      facilityId,
      { specificGroupsOnly: true, deviceType },
    );
    if (inSpecificGroup > 0) {
      await this.model.removeMember(defaultGroup.id, deviceId, deviceType);
      return;
    }

    let sourceUnitId: string | undefined;
    if (deviceType === 'blulok') {
      const row = await this.db('blulok_devices').select('unit_id').where('id', deviceId).first();
      sourceUnitId = row?.unit_id ? String(row.unit_id) : undefined;
    }

    await this.model.addMember(defaultGroup.id, deviceId, deviceType, sourceUnitId);
  }

  /**
   * Assign an access-control device to the facility default group (auto-assignment hook).
   */
  async assignAccessControlToDefaultGroup(
    facilityId: string,
    deviceId: string,
    actor: ActorContext = {},
  ): Promise<void> {
    await this.assignDeviceToDefaultGroup(facilityId, deviceId, 'access_control', actor);
  }

  /**
   * Assign a blulok unit lock to the facility default group (auto-assignment hook).
   */
  async assignBluLokToDefaultGroup(
    facilityId: string,
    deviceId: string,
    actor: ActorContext = {},
  ): Promise<void> {
    await this.assignDeviceToDefaultGroup(facilityId, deviceId, 'blulok', actor);
  }

  /**
   * Assign a unit to the facility default group when it has no bound lock yet.
   * Units with locks are covered by assignBluLokToDefaultGroup.
   */
  async assignUnitToDefaultGroup(
    facilityId: string,
    unitId: string,
    actor: ActorContext = {},
  ): Promise<{ added: boolean }> {
    const boundLock = await this.db('blulok_devices').select('id').where('unit_id', unitId).first();
    if (boundLock) {
      await this.assignBluLokToDefaultGroup(facilityId, String(boundLock.id), actor);
      return { added: false };
    }

    const added = await this.ensureLocklessUnitInDefaultGroup(facilityId, unitId, actor);
    return { added };
  }

  /**
   * Repair pass for migrations and ops tooling — not invoked on read paths.
   * Prefer migration 091 + assignUnitToDefaultGroup on unit create for steady state.
   */
  async backfillDefaultGroupMemberships(
    facilityId: string,
    actor: ActorContext = {},
  ): Promise<{ added: number }> {
    const defaultGroup = await this.ensureDefaultGroup(facilityId, actor);

    const [accessControlDevices, bluLokDevices] = await Promise.all([
      this.db('access_control_devices as acd')
        .select('acd.id')
        .join('gateways as g', 'g.id', 'acd.gateway_id')
        .where('g.facility_id', facilityId),
      this.db('blulok_devices as bd')
        .select('bd.id')
        .join('gateways as g', 'g.id', 'bd.gateway_id')
        .where('g.facility_id', facilityId),
    ]);

    let added = 0;

    const backfillDevice = async (deviceId: string, deviceType: DeviceGroupMemberType): Promise<void> => {
      const inSpecificGroup = await this.model.countAccessControlMembershipsForDevice(
        deviceId,
        facilityId,
        { specificGroupsOnly: true, deviceType },
      );

      if (inSpecificGroup > 0) {
        await this.model.removeMember(defaultGroup.id, deviceId, deviceType);
        return;
      }

      const alreadyInDefault = await this.db('device_group_members')
        .where({
          group_id: defaultGroup.id,
          device_id: deviceId,
          device_type: deviceType,
        })
        .first();

      if (alreadyInDefault) return;

      let sourceUnitId: string | undefined;
      if (deviceType === 'blulok') {
        const row = await this.db('blulok_devices').select('unit_id').where('id', deviceId).first();
        sourceUnitId = row?.unit_id ? String(row.unit_id) : undefined;
      }

      await this.model.addMember(defaultGroup.id, deviceId, deviceType, sourceUnitId);
      added += 1;
    };

    for (const row of accessControlDevices) {
      await backfillDevice(String(row.id), 'access_control');
    }
    for (const row of bluLokDevices) {
      await backfillDevice(String(row.id), 'blulok');
    }

    const units = await this.db('units').select('id').where('facility_id', facilityId);
    for (const row of units) {
      const unitId = String(row.id);
      const boundLock = await this.db('blulok_devices').select('id').where('unit_id', unitId).first();
      if (boundLock) continue;

      if (await this.ensureLocklessUnitInDefaultGroup(facilityId, unitId, actor)) {
        added += 1;
      }
    }

    return { added };
  }

  private async findUnitDefaultMembership(
    defaultGroupId: string,
    unitId: string,
  ): Promise<{ id: string } | undefined> {
    const row = await this.db('device_group_members')
      .where({ group_id: defaultGroupId, device_type: 'blulok' })
      .where(function matchUnitAnchor() {
        this.where('source_unit_id', unitId).orWhere('device_id', unitId);
      })
      .first();
    return row ? { id: String(row.id) } : undefined;
  }

  /** Returns true when a new default-group row was inserted for a lock-less unit. */
  private async ensureLocklessUnitInDefaultGroup(
    facilityId: string,
    unitId: string,
    actor: ActorContext = {},
  ): Promise<boolean> {
    const defaultGroup = await this.ensureDefaultGroup(facilityId, actor);
    const inSpecificGroup = await this.model.countSpecificGroupMembershipsForUnit(unitId, facilityId);
    if (inSpecificGroup > 0) {
      await this.model.removeMember(defaultGroup.id, unitId, 'blulok');
      return false;
    }

    if (await this.findUnitDefaultMembership(defaultGroup.id, unitId)) {
      return false;
    }

    await this.model.addMember(defaultGroup.id, unitId, 'blulok', unitId);
    return true;
  }

  private async removeFromDefaultGroupIfNeeded(
    facilityId: string,
    deviceId: string,
    deviceType: DeviceGroupMemberType,
    targetGroup: DeviceGroup,
  ): Promise<void> {
    if (targetGroup.is_default) return;

    const defaultGroup = await this.model.findDefaultByFacility(facilityId);
    if (!defaultGroup) return;

    await this.model.removeMember(defaultGroup.id, deviceId, deviceType);
  }

  private async isBlulokInventoryDevice(deviceId: string): Promise<boolean> {
    const row = await this.db('blulok_devices').select('id').where('id', deviceId).first();
    return Boolean(row);
  }

  private async rejoinDefaultGroupIfNeeded(
    facilityId: string,
    deviceId: string,
    deviceType: DeviceGroupMemberType,
    removedFromGroup: DeviceGroup,
  ): Promise<void> {
    if (removedFromGroup.is_default) return;

    if (deviceType === 'blulok' && !(await this.isBlulokInventoryDevice(deviceId))) {
      const inSpecificGroup = await this.model.countSpecificGroupMembershipsForUnit(deviceId, facilityId);
      if (inSpecificGroup > 0) return;
      await this.assignUnitToDefaultGroup(facilityId, deviceId);
      return;
    }

    const remainingSpecific = await this.model.countAccessControlMembershipsForDevice(
      deviceId,
      facilityId,
      { specificGroupsOnly: true, deviceType },
    );
    if (remainingSpecific > 0) return;

    await this.assignDeviceToDefaultGroup(facilityId, deviceId, deviceType);
  }

  async create(
    data: CreateDeviceGroupData,
    userRole: UserRole,
    userFacilityIds: string[] | undefined,
    actor: ActorContext = {},
  ): Promise<DeviceGroup> {
    this.assertFacilityAccess(userRole, userFacilityIds, data.facility_id);

    if (data.is_default) {
      throw new ValidationError('Default access groups are created automatically');
    }

    const group = await this.model.create({
      ...data,
      group_type: data.group_type || 'zone',
      is_default: false,
    });

    const hydratedGroup = await this.getGroupOrThrow(group.id);
    await this.logGroupActivity(
      hydratedGroup,
      'Access group created',
      `Created access group "${hydratedGroup.name}"`,
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
    await this.ensureDefaultGroup(facilityId);
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
    this.assertDefaultGroupProtected(existing, data);

    if (data.is_default && !existing.is_default) {
      throw new ValidationError('Default access groups are managed automatically');
    }

    const rollbackGroupState: UpdateDeviceGroupData = {
      group_type: existing.group_type,
      is_default: existing.is_default,
      name: existing.name,
      description: existing.description,
      settings: existing.settings,
      metadata: existing.metadata,
      is_active: existing.is_active,
      access_code_current_code: existing.access_code_current_code ?? null,
      access_code_current_valid_from: existing.access_code_current_valid_from ?? null,
      access_code_current_valid_until: existing.access_code_current_valid_until ?? null,
    };

    const updated = await this.model.update(id, data);
    if (!updated) throw new NotFoundError('Device group');

    const hydratedUpdated = await this.getGroupOrThrow(updated.id);
    const shouldRefreshGatewayCodes = data.is_active !== undefined || data.group_type !== undefined;
    if (shouldRefreshGatewayCodes) {
      try {
        await AccessCodeService.getInstance().pushCodesToGateway(hydratedUpdated.facility_id);
      } catch (pushError) {
        await this.model.update(existing.id, rollbackGroupState);
        throw pushError;
      }
    }
    await this.logGroupActivity(
      hydratedUpdated,
      'Access group updated',
      `Updated access group "${hydratedUpdated.name}"`,
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

    if (group.is_default) {
      throw new ValidationError('The default access group cannot be deleted');
    }

    const members = await this.model.getMembers(group.id);
    await this.model.delete(id);

    for (const member of members) {
      await this.rejoinDefaultGroupIfNeeded(
        group.facility_id,
        member.device_id,
        member.device_type,
        group,
      );
    }
    await AccessCodeService.getInstance().pushCodesToGateway(group.facility_id);

    await this.logGroupActivity(
      group,
      'Access group deleted',
      `Deleted access group "${group.name}"`,
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
    let boundUnitDevice: { id: string } | null = null;

    if (sourceUnitId) {
      if (deviceType !== 'blulok') {
        throw new ValidationError('unit_id can only be used with blulok device_type');
      }
      await this.assertUnitInFacility(sourceUnitId, group.facility_id);
      boundUnitDevice = await this.db('blulok_devices')
        .select('id')
        .where('unit_id', sourceUnitId)
        .first();
      resolvedDeviceId = boundUnitDevice
        ? String(boundUnitDevice.id)
        : sourceUnitId;
    }

    if (!resolvedDeviceId) {
      throw new NotFoundError('Device');
    }

    if (deviceType === 'blulok' && !sourceUnitId) {
      const boundUnit = await this.db('blulok_devices')
        .select('unit_id')
        .where('id', resolvedDeviceId)
        .first();
      if (boundUnit?.unit_id) {
        sourceUnitId = String(boundUnit.unit_id);
      }
    }

    const isUnitOnlyBlulok = deviceType === 'blulok' && Boolean(sourceUnitId) && !boundUnitDevice;
    if (!isUnitOnlyBlulok) {
      await this.assertDeviceInFacility(resolvedDeviceId, group.facility_id, deviceType);
    }

    // Devices live in the default group until moved into one or more specific groups.
    // A device may belong to several specific groups at once (e.g. a shared wing door),
    // but never to a specific group and the default group simultaneously.
    if (!group.is_default) {
      await this.removeFromDefaultGroupIfNeeded(group.facility_id, resolvedDeviceId, deviceType, group);
    }

    const member = await this.model.addMember(groupId, resolvedDeviceId, deviceType, sourceUnitId);

    if (deviceType === 'access_control') {
      await this.pushCodesIfAccessControlChanged(group.facility_id, deviceType);
    }

    await this.logGroupActivity(
      group,
      'Device added to access group',
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

    if (group.is_default) {
      throw new ValidationError(
        'Remove this device from its specific access group instead; default membership is managed automatically',
      );
    }

    await this.model.removeMember(groupId, deviceId, deviceType);

    await this.rejoinDefaultGroupIfNeeded(
      group.facility_id,
      deviceId,
      deviceType ?? 'access_control',
      group,
    );
    await this.pushCodesIfAccessControlChanged(group.facility_id, deviceType);

    await this.logGroupActivity(
      group,
      'Device removed from access group',
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

  private async resolveGroupUnitIds(groupId: string): Promise<string[]> {
    const members = await this.model.getMembers(groupId);
    const blulokMembers = members.filter((member) => member.device_type === 'blulok');
    const unitIds = new Set<string>();

    for (const member of blulokMembers) {
      if (member.source_unit_id) {
        unitIds.add(String(member.source_unit_id));
      }
    }

    const deviceIdsWithoutUnit = blulokMembers
      .filter((member) => !member.source_unit_id)
      .map((member) => member.device_id);

    if (deviceIdsWithoutUnit.length > 0) {
      const rows = await this.db('blulok_devices')
        .select('unit_id')
        .whereIn('id', deviceIdsWithoutUnit)
        .whereNotNull('unit_id');
      for (const row of rows) {
        unitIds.add(String(row.unit_id));
      }
    }

    return Array.from(unitIds);
  }

  async getUsersWithAccess(
    groupId: string,
    userRole: UserRole,
    userFacilityIds: string[] | undefined,
  ): Promise<DeviceGroupUserAccess[]> {
    const group = await this.getGroupOrThrow(groupId);
    this.assertFacilityAccess(userRole, userFacilityIds, group.facility_id);

    const unitIds = await this.resolveGroupUnitIds(groupId);
    const userMap = new Map<string, DeviceGroupUserAccess>();

    const upsertUser = (
      row: {
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string;
        role: UserRole;
      },
      reason: DeviceGroupUserAccessReason,
      unitNumber?: string | null,
    ): void => {
      const existing = userMap.get(row.id);
      if (existing) {
        if (!existing.access_reasons.includes(reason)) {
          existing.access_reasons.push(reason);
        }
        if (unitNumber && !existing.unit_numbers.includes(unitNumber)) {
          existing.unit_numbers.push(unitNumber);
        }
        return;
      }

      userMap.set(row.id, {
        user_id: row.id,
        first_name: row.first_name ?? null,
        last_name: row.last_name ?? null,
        email: row.email,
        role: row.role,
        access_reasons: [reason],
        unit_numbers: unitNumber ? [unitNumber] : [],
      });
    };

    if (unitIds.length > 0) {
      const assignmentRows = await this.db('unit_assignments as ua')
        .join('users as u', 'u.id', 'ua.tenant_id')
        .join('units as un', 'un.id', 'ua.unit_id')
        .select(
          'u.id',
          'u.first_name',
          'u.last_name',
          'u.email',
          'u.role',
          'un.unit_number',
          'ua.is_primary',
        )
        .whereIn('ua.unit_id', unitIds)
        .where('u.is_active', true)
        .whereNotIn('u.role', GROUP_ACCESS_EXCLUDED_USER_ROLES)
        .where((qb) => {
          qb.whereNull('ua.access_expires_at').orWhere('ua.access_expires_at', '>', this.db.fn.now());
        });

      for (const row of assignmentRows) {
        const reason: DeviceGroupUserAccessReason = row.is_primary ? 'primary_tenant' : 'assigned_tenant';
        upsertUser(row, reason, row.unit_number ? String(row.unit_number) : null);
      }

      const sharedRows = await this.db('key_sharing as ks')
        .join('users as u', 'u.id', 'ks.shared_with_user_id')
        .join('units as un', 'un.id', 'ks.unit_id')
        .select(
          'u.id',
          'u.first_name',
          'u.last_name',
          'u.email',
          'u.role',
          'un.unit_number',
        )
        .whereIn('ks.unit_id', unitIds)
        .where('ks.is_active', true)
        .where('u.is_active', true)
        .whereNotIn('u.role', GROUP_ACCESS_EXCLUDED_USER_ROLES)
        .where((qb) => {
          qb.whereNull('ks.expires_at').orWhere('ks.expires_at', '>', this.db.fn.now());
        });

      for (const row of sharedRows) {
        upsertUser(row, 'shared_key', row.unit_number ? String(row.unit_number) : null);
      }
    }

    const sortKey = (user: DeviceGroupUserAccess): string => {
      const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
      return (name || user.email).toLowerCase();
    };

    return Array.from(userMap.values())
      .map((user) => ({
        ...user,
        access_reasons: [...user.access_reasons],
        unit_numbers: [...user.unit_numbers].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      }))
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  }
}
