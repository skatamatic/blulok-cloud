import { UserRole } from '@/types/auth.types';
import { DeviceModel, type DeviceFilters } from '@/models/device.model';
import { DeviceGroupModel } from '@/models/device-group.model';
import { UnitModel } from '@/models/unit.model';
import { DeviceEventService } from './device-event.service';
import { DatabaseService } from './database.service';
import { logger } from '@/utils/logger';
import type { Knex } from 'knex';
import {
  normalizeDeviceListSortKey,
  normalizeNetworkInfraSortKey,
  sortMergedDeviceList,
  needsInMemoryDeviceSort,
} from '@/utils/merged-device-list.utils';
export type BluLokInventoryDeleteSource = 'admin_api' | 'gateway_sync';
export type AccessControlInventoryDeleteSource = 'admin_api' | 'gateway_sync';
export type NetworkInfraInventoryDeleteSource = 'admin_api' | 'gateway_sync';

export interface NetworkInfraInventoryDeleteResult {
  gatewayId: string;
  facilityId: string | null;
  deviceKind: 'bridge' | 'friend_node';
  deviceSerial: string;
}

export interface BluLokInventoryDeleteResult {
  gatewayId: string;
  facilityId: string | null;
  hadUnit: boolean;
  unitId: string | null;
  deviceSerial?: string;
}

export interface AccessControlInventoryDeleteResult {
  gatewayId: string;
  facilityId: string | null;
  accessId: string;
  relayChannel: number;
}

/**
 * Devices Service
 *
 * Comprehensive service for managing device-to-unit assignments.
 * Handles device assignment lifecycle and ensures proper RBAC/scoping.
 */
export class DevicesService {
  private static instance: DevicesService;
  private deviceModel: DeviceModel;
  private unitModel: UnitModel;
  private deviceGroupModel: DeviceGroupModel;
  private eventService: DeviceEventService;

  private constructor() {
    this.deviceModel = new DeviceModel();
    this.unitModel = new UnitModel();
    this.deviceGroupModel = new DeviceGroupModel();
    this.eventService = DeviceEventService.getInstance();
  }

  public static getInstance(): DevicesService {
    if (!DevicesService.instance) {
      DevicesService.instance = new DevicesService();
    }
    return DevicesService.instance;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Device List Operations (extracted from devices.routes.ts)
  // ────────────────────────────────────────────────────────────────────────────

  static readonly DEFAULT_LIST_LIMIT = 30;
  static readonly MAX_LIST_LIMIT = 200;

  /**
   * Parse and clamp list limit from query parameter.
   */
  static parseListLimit(raw: unknown): number | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined;
    const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (!Number.isFinite(n) || n < 1) return undefined;
    return Math.min(Math.floor(n), DevicesService.MAX_LIST_LIMIT);
  }

  /**
   * Parse list offset from query parameter.
   */
  static parseListOffset(raw: unknown): number {
    if (raw === undefined || raw === null || raw === '') return 0;
    const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  }

  /**
   * List devices with filtering, sorting, pagination, and optional scope merging.
   * Extracted from GET /api/v1/devices handler.
   * @param deviceModelOverride - Optional DeviceModel instance (used for testing with mocks)
   */
  async listDevices(params: {
    deviceType?: string;
    deviceScope: 'operational' | 'network_infra' | 'all';
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    facilityId?: string;
    facilityIds?: string[];
    search?: string;
    statusFilter?: string;
    limit?: number;
    offset?: number;
    projectionId?: boolean;
    enrichFn?: (devices: any[]) => Promise<any[]>;
    applyStatusFilter?: (devices: any[], status: string | undefined) => any[];
    deviceModelOverride?: DeviceModel;
  }): Promise<{ devices: any[]; total: number }> {
    const {
      deviceType,
      deviceScope,
      sortBy: sortByParam,
      sortOrder: sortOrderParam = 'asc',
      facilityId,
      facilityIds,
      search,
      statusFilter,
      limit: limitParsed,
      offset: offsetNum = 0,
      projectionId = false,
      enrichFn,
      applyStatusFilter,
      deviceModelOverride,
    } = params;

    const model = deviceModelOverride ?? this.deviceModel;
    const sortKey = normalizeDeviceListSortKey(sortByParam);
    const order: 'asc' | 'desc' = sortOrderParam === 'desc' ? 'desc' : 'asc';

    if (deviceScope === 'network_infra') {
      return this.listNetworkInfraDevices({
        sortBy: sortByParam,
        sortOrder: order,
        facilityId,
        facilityIds,
        search,
        statusFilter,
        limit: limitParsed,
        offset: offsetNum,
        projectionId,
        enrichFn,
        applyStatusFilter,
      });
    }

    const baseFilters: DeviceFilters = {
      device_type: deviceType as any,
      search,
    };
    if (facilityId) {
      (baseFilters as any).facility_id = facilityId;
    } else if (facilityIds && facilityIds.length > 0) {
      (baseFilters as any).facility_ids = facilityIds;
    }

    let devices: any[] = [];
    let total = 0;
    let devicesEnriched = false;

    const dt = deviceType;
    const mergeAllScopes = deviceScope === 'all';

    if (needsInMemoryDeviceSort(dt, sortKey) || mergeAllScopes || Boolean(statusFilter)) {
      const fetchFilters: DeviceFilters = {
        ...baseFilters,
        sortBy: 'created_at',
        sortOrder: 'asc',
        ...(projectionId ? { skipPrimaryTenantEnrichment: true } : {}),
      };

      if (!dt || dt === 'all') {
        const [accessControlDevices, blulokDevices] = await Promise.all([
          model.findAccessControlDevices(fetchFilters),
          model.findBluLokDevices(fetchFilters),
        ]);
        devices = [
          ...accessControlDevices.map((d) => ({ ...d, device_category: 'access_control' })),
          ...blulokDevices.map((d) => ({ ...d, device_category: 'blulok' })),
        ];
      } else if (dt === 'access_control') {
        const accessControlDevices = await model.findAccessControlDevices(fetchFilters);
        devices = accessControlDevices.map((d) => ({ ...d, device_category: 'access_control' }));
      } else {
        const blulokDevices = await model.findBluLokDevices(fetchFilters);
        devices = blulokDevices.map((d) => ({ ...d, device_category: 'blulok' }));
      }

      if (mergeAllScopes) {
        const { GatewayInventoryDeviceSyncService } = await import('@/services/gateway-inventory-device-sync.service');
        const { devices: networkInfraDevices } =
          await GatewayInventoryDeviceSyncService.getInstance().listNetworkInfraDevices({
            search,
            ...(facilityId ? { facility_id: facilityId } : {}),
            ...(facilityIds ? { facility_ids: facilityIds } : {}),
          });
        devices = [...devices, ...networkInfraDevices];
      }

      if (!projectionId && enrichFn) {
        devices = await enrichFn(devices);
        devicesEnriched = true;
        if (applyStatusFilter && statusFilter) {
          devices = applyStatusFilter(devices, statusFilter);
        }
      }

      sortMergedDeviceList(devices, sortKey, order);
      total = devices.length;
      let pageSize: number;
      if (limitParsed !== undefined) {
        pageSize = limitParsed;
      } else if (projectionId) {
        pageSize = total;
      } else {
        pageSize = Math.min(DevicesService.DEFAULT_LIST_LIMIT, total);
      }
      devices = devices.slice(offsetNum, offsetNum + pageSize);
    } else {
      const filters: DeviceFilters = {
        ...baseFilters,
        sortBy: sortKey as any,
        sortOrder: order,
        ...(projectionId ? { skipPrimaryTenantEnrichment: true } : {}),
      };

      const allowUnboundedDb = projectionId && limitParsed === undefined;

      if (!allowUnboundedDb) {
        filters.limit = limitParsed ?? DevicesService.DEFAULT_LIST_LIMIT;
      }
      filters.offset = offsetNum;

      if (dt === 'access_control') {
        const accessControlDevices = await model.findAccessControlDevices(filters);
        devices = accessControlDevices.map((d) => ({ ...d, device_category: 'access_control' }));
        total = await model.countAccessControlDevices(baseFilters);
      } else {
        const blulokDevices = await model.findBluLokDevices(filters);
        devices = blulokDevices.map((d) => ({ ...d, device_category: 'blulok' }));
        total = await model.countBluLokDevices(baseFilters);
      }
    }

    if (!projectionId && devices.length > 0 && !devicesEnriched && enrichFn) {
      devices = await enrichFn(devices);
    }

    if (projectionId) {
      devices = devices.map((d) => ({
        id: d.id,
        device_category: d.device_category,
      }));
    }

    return { devices, total };
  }

  /**
   * List network infrastructure devices with filtering and pagination.
   */
  private async listNetworkInfraDevices(params: {
    sortBy?: string;
    sortOrder: 'asc' | 'desc';
    facilityId?: string;
    facilityIds?: string[];
    search?: string;
    statusFilter?: string;
    limit?: number;
    offset?: number;
    projectionId?: boolean;
    enrichFn?: (devices: any[]) => Promise<any[]>;
    applyStatusFilter?: (devices: any[], status: string | undefined) => any[];
  }): Promise<{ devices: any[]; total: number }> {
    const {
      sortBy: sortByParam,
      sortOrder: order,
      facilityId,
      facilityIds,
      search,
      statusFilter,
      limit: limitParsed,
      offset: offsetNum = 0,
      projectionId = false,
      enrichFn,
      applyStatusFilter,
    } = params;

    const { GatewayInventoryDeviceSyncService } = await import('@/services/gateway-inventory-device-sync.service');
    const infraSortKey = normalizeNetworkInfraSortKey(sortByParam);
    const fetchAllForEffectiveFilter = Boolean(statusFilter);
    const infraFilters = {
      search,
      sortBy: infraSortKey as any,
      sortOrder: order,
      ...(fetchAllForEffectiveFilter
        ? {}
        : {
            offset: offsetNum,
            limit: limitParsed ?? (projectionId ? undefined : DevicesService.DEFAULT_LIST_LIMIT),
          }),
      ...(facilityId ? { facility_id: facilityId } : {}),
      ...(facilityIds ? { facility_ids: facilityIds } : {}),
    };
    let { devices: networkInfraDevices } =
      await GatewayInventoryDeviceSyncService.getInstance().listNetworkInfraDevices(infraFilters);

    if (projectionId) {
      return {
        devices: networkInfraDevices.map((d) => ({
          id: d.id,
          device_category: d.device_category,
        })),
        total: networkInfraDevices.length,
      };
    }

    if (enrichFn) {
      networkInfraDevices = await enrichFn(networkInfraDevices);
    }
    if (applyStatusFilter && statusFilter) {
      networkInfraDevices = applyStatusFilter(networkInfraDevices, statusFilter);
    }
    const infraTotal = networkInfraDevices.length;
    if (fetchAllForEffectiveFilter) {
      const pageSize = limitParsed ?? DevicesService.DEFAULT_LIST_LIMIT;
      networkInfraDevices = networkInfraDevices.slice(offsetNum, offsetNum + pageSize);
    }

    return { devices: networkInfraDevices, total: infraTotal };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Device Assignment Operations
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Assign a device to a unit
   *
   * If the unit already has a device assigned, the old device will be unassigned first.
   * If the device is already assigned to a different unit, an error will be thrown.
   */
  async assignDeviceToUnit(
    deviceId: string,
    unitId: string,
    options: {
      performedBy: string;
      source?: 'manual' | 'fms_sync' | 'api';
    },
  ): Promise<void> {
    try {
      const knex = DatabaseService.getInstance().connection;
      const foundDevice = await knex('blulok_devices').where('id', deviceId).first();

      if (!foundDevice) {
        throw new Error('Device not found');
      }

      const unit = await this.unitModel.findById(unitId);
      if (!unit) {
        throw new Error('Unit not found');
      }

      const gateway = await knex('gateways').where('id', foundDevice.gateway_id).first();

      if (!gateway) {
        throw new Error('Gateway not found for device');
      }

      const deviceFacilityId = gateway.facility_id;

      if (unit.facility_id !== deviceFacilityId) {
        throw new Error('Device and unit must belong to the same facility');
      }

      if (foundDevice.unit_id && foundDevice.unit_id !== unitId) {
        throw new Error('Device is already assigned to another unit. Unassign it first or change the assignment.');
      }

      if (foundDevice.unit_id === unitId) {
        logger.warn(`Device ${deviceId} is already assigned to unit ${unitId}`);
        return;
      }

      const existingDevice = await knex('blulok_devices').where('unit_id', unitId).first();

      let oldDeviceId: string | null = null;
      if (existingDevice && existingDevice.id !== deviceId) {
        oldDeviceId = existingDevice.id;
        await this.deviceModel.unassignDeviceFromUnit(existingDevice.id);
        await this.deviceGroupModel.syncUnitLinkedMembers(unitId, existingDevice.id);

        this.eventService.emitDeviceUnassigned({
          deviceId: existingDevice.id,
          unitId,
          facilityId: unit.facility_id,
          metadata: {
            source: options.source || 'api',
            performedBy: options.performedBy,
            reason: 'reassigned',
          },
        });

        logger.info(`Unassigned device ${existingDevice.id} from unit ${unitId} due to reassignment`);
      }

      await this.deviceModel.assignDeviceToUnit(deviceId, unitId);
      await this.deviceGroupModel.syncUnitLinkedMembers(unitId, deviceId);

      this.eventService.emitDeviceAssigned({
        deviceId,
        unitId,
        facilityId: unit.facility_id,
        metadata: {
          source: options.source || 'api',
          performedBy: options.performedBy,
        },
      });

      logger.info(`Device ${deviceId} assigned to unit ${unitId} by ${options.performedBy}`, {
        source: options.source || 'api',
        facilityId: unit.facility_id,
        oldDeviceId,
        syncedGroupMembersToUnit: unitId,
      });
    } catch (error) {
      logger.error('Error assigning device to unit:', error);
      throw error;
    }
  }

  /**
   * Unassign a device from a unit
   */
  async unassignDeviceFromUnit(
    deviceId: string,
    options: {
      performedBy: string;
      source?: 'manual' | 'fms_sync' | 'api';
    },
  ): Promise<void> {
    try {
      const knex = DatabaseService.getInstance().connection;
      const foundDevice = await knex('blulok_devices').where('id', deviceId).first();

      if (!foundDevice) {
        throw new Error('Device not found');
      }

      if (!foundDevice.unit_id) {
        logger.warn(`Device ${deviceId} is not assigned to any unit`);
        return;
      }

      const unitId = foundDevice.unit_id;
      const unit = await this.unitModel.findById(unitId);
      if (!unit) {
        logger.warn(`Unit ${unitId} not found, but proceeding with device unassignment`);
      }

      const gateway = await knex('gateways').where('id', foundDevice.gateway_id).first();

      const facilityId = gateway?.facility_id || unit?.facility_id;
      if (!facilityId) {
        throw new Error('Cannot determine facility for device');
      }

      await this.deviceModel.unassignDeviceFromUnit(deviceId);
      await this.deviceGroupModel.syncUnitLinkedMembers(unitId, unitId);

      this.eventService.emitDeviceUnassigned({
        deviceId,
        unitId,
        facilityId,
        metadata: {
          source: options.source || 'api',
          performedBy: options.performedBy,
        },
      });

      logger.info(`Device ${deviceId} unassigned from unit ${unitId} by ${options.performedBy}`, {
        source: options.source || 'api',
        facilityId,
      });
    } catch (error) {
      logger.error('Error unassigning device from unit:', error);
      throw error;
    }
  }

  /**
   * Permanently remove a BluLok device row from cloud inventory (admin commissioning).
   */
  async removeBluLokDeviceFromCloudInventory(
    deviceId: string,
    options: { performedBy: string },
  ): Promise<BluLokInventoryDeleteResult> {
    return this.deleteBluLokFromInventory(deviceId, {
      performedBy: options.performedBy,
      source: 'admin_api',
    });
  }

  /**
   * Delete a BluLok cloud inventory row and related memberships.
   * Used by admin HTTP DELETE and gateway inventory/sync removal paths.
   */
  async deleteBluLokFromInventory(
    deviceId: string,
    options: {
      performedBy?: string;
      source: BluLokInventoryDeleteSource;
    },
  ): Promise<BluLokInventoryDeleteResult> {
    const knex = DatabaseService.getInstance().connection;

    const result = await knex.transaction(async (trx) => {
      const device = await trx('blulok_devices').where('id', deviceId).first();
      if (!device) {
        throw new Error('Device not found');
      }

      const gateway = await trx('gateways').where('id', device.gateway_id).first();
      const facilityId: string | null = gateway?.facility_id ?? null;
      const unitId: string | null = device.unit_id ?? null;
      const hadUnit = Boolean(unitId);

      const shouldPushAccessCodes = await this.willRemoveAccessCodeGroupMembership(trx, deviceId, unitId);

      await this.deviceGroupModel.removeDirectBluLokMembershipsForDevice(deviceId, trx);

      if (unitId) {
        await this.deviceGroupModel.syncUnitLinkedMembers(unitId, unitId, trx);
      }

      const deleted = await trx('blulok_devices').where('id', deviceId).del();
      if (!deleted) {
        throw new Error('Device not found');
      }

      return {
        gatewayId: String(device.gateway_id),
        facilityId,
        hadUnit,
        unitId,
        shouldPushAccessCodes,
        deviceSerial: String(device.device_serial),
      };
    });

    if (options.source !== 'gateway_sync' && result.facilityId && result.deviceSerial) {
      try {
        const { DeviceDeletionOutboxService } = await import('@/services/device-deletion-outbox.service');
        await DeviceDeletionOutboxService.getInstance().enqueueDeletion({
          facilityId: result.facilityId,
          gatewayId: result.gatewayId,
          deviceKind: 'blulok',
          lockId: result.deviceSerial,
        });
      } catch (err) {
        logger.warn('Failed to enqueue DEVICE_DELETED tombstone for BluLok device:', err);
      }
    }

    if (result.hadUnit && result.unitId && result.facilityId) {
      this.eventService.emitDeviceUnassigned({
        deviceId,
        unitId: result.unitId,
        facilityId: result.facilityId,
        metadata: {
          source: 'api',
          performedBy: options.performedBy,
          reason: 'inventory_removed',
        },
      });
    }

    this.eventService.emitDeviceRemoved({
      deviceId,
      deviceType: 'blulok',
      gatewayId: result.gatewayId,
      facilityId: result.facilityId ?? undefined,
      unitId: result.hadUnit ? result.unitId ?? null : null,
    });

    if (result.shouldPushAccessCodes && result.facilityId) {
      const pushAccessCodes = async () => {
        const { AccessCodeService } = await import('@/services/access-code.service');
        await AccessCodeService.getInstance().pushCodesToGateway(result.facilityId!);
      };
      if (options.source === 'gateway_sync') {
        void pushAccessCodes().catch((err) => {
          logger.warn('Failed to push access codes after BluLok inventory removal:', err);
        });
      } else {
        try {
          await pushAccessCodes();
        } catch (err) {
          logger.warn('Failed to push access codes after BluLok inventory removal:', err);
        }
      }
    }

    if (result.hadUnit && result.unitId) {
      try {
        const { DenylistEntryModel } = await import('@/models/denylist-entry.model');
        await new DenylistEntryModel().removeByDevice(deviceId);
      } catch (err) {
        logger.warn('Failed to prune denylist entries for removed BluLok device:', err);
      }
    }

    logger.info(
      `BluLok device ${deviceId} removed from cloud inventory (source=${options.source}, by=${options.performedBy ?? 'system'}, facility=${result.facilityId ?? 'none'}, hadUnit=${result.hadUnit})`,
    );

    return {
      gatewayId: result.gatewayId,
      facilityId: result.facilityId,
      hadUnit: result.hadUnit,
      unitId: result.unitId,
      deviceSerial: result.deviceSerial,
    };
  }

  /**
   * Permanently remove an access control device row from cloud inventory (admin HTTP DELETE).
   */
  async removeAccessControlDeviceFromCloudInventory(
    deviceId: string,
    options: { performedBy: string },
  ): Promise<AccessControlInventoryDeleteResult> {
    return this.deleteAccessControlFromInventory(deviceId, {
      performedBy: options.performedBy,
      source: 'admin_api',
    });
  }

  /**
   * Delete an access control cloud inventory row and related memberships.
   * Used by admin HTTP DELETE and gateway inventory/sync removal paths.
   */
  async deleteAccessControlFromInventory(
    deviceId: string,
    options: {
      performedBy?: string;
      source: AccessControlInventoryDeleteSource;
    },
  ): Promise<AccessControlInventoryDeleteResult> {
    const knex = DatabaseService.getInstance().connection;

    const result = await knex.transaction(async (trx) => {
      const device = await trx('access_control_devices').where('id', deviceId).first();
      if (!device) {
        throw new Error('Device not found');
      }

      const gateway = await trx('gateways').where('id', device.gateway_id).first();
      const facilityId: string | null = gateway?.facility_id ?? null;
      const accessId = String(device.device_serial);
      const relayChannel = Number(device.relay_channel ?? 1);

      const shouldPushAccessCodes = await trx('device_group_members as m')
        .join('device_groups as g', 'g.id', 'm.group_id')
        .where('m.device_id', deviceId)
        .andWhere('m.device_type', 'access_control')
        .first()
        .then(Boolean);

      await trx('device_group_members')
        .where({ device_id: deviceId, device_type: 'access_control' })
        .del();

      const deleted = await trx('access_control_devices').where('id', deviceId).del();
      if (!deleted) {
        throw new Error('Device not found');
      }

      return {
        gatewayId: String(device.gateway_id),
        facilityId,
        accessId,
        relayChannel,
        shouldPushAccessCodes,
      };
    });

    this.eventService.emitDeviceRemoved({
      deviceId,
      deviceType: 'access_control',
      gatewayId: result.gatewayId,
      facilityId: result.facilityId ?? undefined,
      unitId: null,
    });

    if (result.shouldPushAccessCodes && result.facilityId) {
      const pushAccessCodes = async () => {
        const { AccessCodeService } = await import('@/services/access-code.service');
        await AccessCodeService.getInstance().pushCodesToGateway(result.facilityId!);
      };
      if (options.source === 'gateway_sync') {
        void pushAccessCodes().catch((err) => {
          logger.warn('Failed to push access codes after access control inventory removal:', err);
        });
      } else {
        try {
          await pushAccessCodes();
        } catch (err) {
          logger.warn('Failed to push access codes after access control inventory removal:', err);
        }
      }
    }

    if (options.source !== 'gateway_sync' && result.facilityId) {
      try {
        const { DeviceDeletionOutboxService } = await import('@/services/device-deletion-outbox.service');
        await DeviceDeletionOutboxService.getInstance().enqueueDeletion({
          facilityId: result.facilityId,
          gatewayId: result.gatewayId,
          deviceKind: 'access_control',
          accessId: result.accessId,
          relayChannel: result.relayChannel,
        });
      } catch (err) {
        logger.warn('Failed to enqueue DEVICE_DELETED tombstone for access control device:', err);
      }
    }

    logger.info(
      `Access control device ${deviceId} removed from cloud inventory (source=${options.source}, by=${options.performedBy ?? 'system'}, facility=${result.facilityId ?? 'none'})`,
    );

    return {
      gatewayId: result.gatewayId,
      facilityId: result.facilityId,
      accessId: result.accessId,
      relayChannel: result.relayChannel,
    };
  }

  async removeNetworkInfraDeviceFromCloudInventory(
    deviceId: string,
    options: { performedBy: string },
  ): Promise<NetworkInfraInventoryDeleteResult> {
    return this.deleteNetworkInfraFromInventory(deviceId, {
      performedBy: options.performedBy,
      source: 'admin_api',
    });
  }

  async deleteNetworkInfraFromInventory(
    deviceId: string,
    options: {
      performedBy?: string;
      source: NetworkInfraInventoryDeleteSource;
    },
  ): Promise<NetworkInfraInventoryDeleteResult> {
    const knex = DatabaseService.getInstance().connection;

    const result = await knex.transaction(async (trx) => {
      const device = await trx('gateway_inventory_devices').where('id', deviceId).first();
      if (!device) {
        throw new Error('Device not found');
      }

      const gateway = await trx('gateways').where('id', device.gateway_id).first();
      const facilityId: string | null = gateway?.facility_id ?? null;
      const deviceKind = String(device.device_kind) as 'bridge' | 'friend_node';
      const deviceSerial = String(device.device_serial);

      const deleted = await trx('gateway_inventory_devices').where('id', deviceId).del();
      if (!deleted) {
        throw new Error('Device not found');
      }

      return {
        gatewayId: String(device.gateway_id),
        facilityId,
        deviceKind,
        deviceSerial,
      };
    });

    if (options.source !== 'gateway_sync' && result.facilityId) {
      try {
        const { DeviceDeletionOutboxService } = await import('@/services/device-deletion-outbox.service');
        await DeviceDeletionOutboxService.getInstance().enqueueDeletion({
          facilityId: result.facilityId,
          gatewayId: result.gatewayId,
          deviceKind: result.deviceKind,
          deviceSerial: result.deviceSerial,
        });
      } catch (err) {
        logger.warn('Failed to enqueue DEVICE_DELETED tombstone for network infra device:', err);
      }
    }

    logger.info(
      `Network infra device ${deviceId} removed from cloud inventory (source=${options.source}, by=${options.performedBy ?? 'system'}, facility=${result.facilityId ?? 'none'})`,
    );

    return result;
  }

  private async willRemoveAccessCodeGroupMembership(
    trx: Knex.Transaction,
    deviceId: string,
    unitId: string | null,
  ): Promise<boolean> {
    const query = trx('device_group_members as m')
      .join('device_groups as g', 'g.id', 'm.group_id')
      .andWhere('g.group_type', 'access_code')
      .andWhere('m.device_type', 'blulok')
      .andWhere((builder) => {
        builder.where('m.device_id', deviceId);
        if (unitId) {
          builder.orWhere('m.source_unit_id', unitId);
        }
      });

    const row = await query.first();
    return Boolean(row);
  }

  /** Cancel a pending deletion tombstone when a BluLok device is (re-)added to inventory. */
  async cancelDeletionTombstoneForBlulok(facilityId: string, lockId: string): Promise<void> {
    try {
      const { DeviceDeletionOutboxService } = await import('@/services/device-deletion-outbox.service');
      await DeviceDeletionOutboxService.getInstance().cancelForBlulok(facilityId, lockId);
    } catch (err) {
      logger.warn(`Failed to cancel DEVICE_DELETED tombstone for BluLok ${lockId}:`, err);
    }
  }

  /** Cancel a pending deletion tombstone when an access control device is (re-)added. */
  async cancelDeletionTombstoneForAccessControl(
    facilityId: string,
    accessId: string,
    relayChannel: number,
  ): Promise<void> {
    try {
      const { DeviceDeletionOutboxService } = await import('@/services/device-deletion-outbox.service');
      await DeviceDeletionOutboxService.getInstance().cancelForAccessControl(
        facilityId,
        accessId,
        relayChannel,
      );
    } catch (err) {
      logger.warn(
        `Failed to cancel DEVICE_DELETED tombstone for access control ${accessId}:${relayChannel}:`,
        err,
      );
    }
  }

  /**
   * Check if a user has access to manage a specific device
   */
  async hasUserAccessToDevice(deviceId: string, userId: string, userRole: UserRole): Promise<boolean> {
    try {
      if (userRole === UserRole.ADMIN || userRole === UserRole.DEV_ADMIN) {
        return true;
      }

      if (userRole === UserRole.FACILITY_ADMIN) {
        const knex = DatabaseService.getInstance().connection;
        const foundDevice = await knex('blulok_devices').where('id', deviceId).first();

        if (!foundDevice) {
          return false;
        }

        const gateway = await knex('gateways').where('id', foundDevice.gateway_id).first();

        if (!gateway) {
          return false;
        }

        const userFacilities = await knex('user_facility_associations')
          .where('user_id', userId)
          .where('facility_id', gateway.facility_id)
          .first();

        return !!userFacilities;
      }

      return false;
    } catch (error: unknown) {
      logger.error('Error checking user access to device:', error);
      return false;
    }
  }

  async hasUserAccessToAccessControlDevice(
    deviceId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<boolean> {
    try {
      if (userRole === UserRole.ADMIN || userRole === UserRole.DEV_ADMIN) {
        return true;
      }

      if (userRole === UserRole.FACILITY_ADMIN) {
        const knex = DatabaseService.getInstance().connection;
        const foundDevice = await knex('access_control_devices').where('id', deviceId).first();
        if (!foundDevice) {
          return false;
        }

        const gateway = await knex('gateways').where('id', foundDevice.gateway_id).first();
        if (!gateway?.facility_id) {
          return false;
        }

        const userFacilities = await knex('user_facility_associations')
          .where('user_id', userId)
          .where('facility_id', gateway.facility_id)
          .first();

        return !!userFacilities;
      }

      return false;
    } catch (error: unknown) {
      logger.error('Error checking user access to access control device:', error);
      return false;
    }
  }

  async hasUserAccessToNetworkInfraDevice(
    deviceId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<boolean> {
    try {
      if (userRole === UserRole.ADMIN || userRole === UserRole.DEV_ADMIN) {
        return true;
      }

      if (userRole === UserRole.FACILITY_ADMIN) {
        const knex = DatabaseService.getInstance().connection;
        const foundDevice = await knex('gateway_inventory_devices').where('id', deviceId).first();
        if (!foundDevice) {
          return false;
        }

        const gateway = await knex('gateways').where('id', foundDevice.gateway_id).first();
        if (!gateway?.facility_id) {
          return false;
        }

        const userFacilities = await knex('user_facility_associations')
          .where('user_id', userId)
          .where('facility_id', gateway.facility_id)
          .first();

        return !!userFacilities;
      }

      return false;
    } catch (error: unknown) {
      logger.error('Error checking user access to network infra device:', error);
      return false;
    }
  }
}
