import { UserRole } from '@/types/auth.types';
import { DeviceModel } from '@/models/device.model';
import { DeviceGroupModel } from '@/models/device-group.model';
import { UnitModel } from '@/models/unit.model';
import { DeviceEventService } from './device-event.service';
import { DatabaseService } from './database.service';
import { logger } from '@/utils/logger';
import type { Knex } from 'knex';

export type BluLokInventoryDeleteSource = 'admin_api' | 'gateway_sync';

export interface BluLokInventoryDeleteResult {
  gatewayId: string;
  facilityId: string | null;
  hadUnit: boolean;
  unitId: string | null;
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
      await this.deviceGroupModel.syncUnitLinkedMembers(unitId, deviceId);

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

      await trx('device_group_members').where({ device_id: deviceId, device_type: 'blulok' }).del();

      if (unitId) {
        await trx('device_group_members').where({ source_unit_id: unitId, device_type: 'blulok' }).del();
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
      };
    });

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
    });

    if (result.shouldPushAccessCodes && result.facilityId) {
      try {
        const { AccessCodeService } = await import('@/services/access-code.service');
        await AccessCodeService.getInstance().pushCodesToGateway(result.facilityId);
      } catch (err) {
        logger.warn('Failed to push access codes after BluLok inventory removal:', err);
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
    };
  }

  private async willRemoveAccessCodeGroupMembership(
    trx: Knex.Transaction,
    deviceId: string,
    unitId: string | null,
  ): Promise<boolean> {
    const query = trx('device_group_members as m')
      .join('device_groups as g', 'g.id', 'm.group_id')
      .where('g.group_type', 'access_code')
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
}
