import { UserRole } from '@/types/auth.types';
import { DeviceModel, BluLokDevice } from '@/models/device.model';
import { UnitModel } from '@/models/unit.model';
import { DeviceEventService } from './device-event.service';
import { DatabaseService } from './database.service';
import { logger } from '@/utils/logger';

/**
 * Devices Service
 *
 * Comprehensive service for managing device-to-unit assignments.
 * Handles device assignment lifecycle and ensures proper RBAC/scoping.
 *
 * Key Features:
 * - Device-to-unit assignment management
 * - Facility-scoped device operations
 * - Role-based access control
 * - Event-driven updates for real-time synchronization
 * - Validation and constraint handling
 *
 * Device Operations:
 * - Assign device to unit (handles reassignment automatically)
 * - Unassign device from unit
 * - Validate device and unit compatibility
 * - Ensure facility consistency
 *
 * Security Model:
 * - Facility-scoped access control
 * - Role-based permissions (ADMIN, DEV_ADMIN, FACILITY_ADMIN)
 * - Audit logging for all operations
 * - Event-driven system updates
 */
export class DevicesService {
  private static instance: DevicesService;
  private deviceModel: DeviceModel;
  private unitModel: UnitModel;
  private eventService: DeviceEventService;

  private constructor() {
    this.deviceModel = new DeviceModel();
    this.unitModel = new UnitModel();
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
    }
  ): Promise<void> {
    try {
      // Validate device exists and get details
      const knex = DatabaseService.getInstance().connection;
      const foundDevice = await knex('blulok_devices')
        .where('id', deviceId)
        .first();
      
      if (!foundDevice) {
        throw new Error('Device not found');
      }

      // Validate unit exists
      const unit = await this.unitModel.findById(unitId);
      if (!unit) {
        throw new Error('Unit not found');
      }

      // Get device's facility from gateway (authoritative source)
      const gateway = await knex('gateways')
        .where('id', foundDevice.gateway_id)
        .first();
      
      if (!gateway) {
        throw new Error('Gateway not found for device');
      }

      const deviceFacilityId = gateway.facility_id;
      
      // Validate device and unit belong to same facility
      if (unit.facility_id !== deviceFacilityId) {
        throw new Error('Device and unit must belong to the same facility');
      }

      // Check if device is already assigned to a different unit
      if (foundDevice.unit_id && foundDevice.unit_id !== unitId) {
        throw new Error('Device is already assigned to another unit. Unassign it first or change the assignment.');
      }

      // If device is already assigned to this unit, no-op
      if (foundDevice.unit_id === unitId) {
        logger.warn(`Device ${deviceId} is already assigned to unit ${unitId}`);
        return;
      }

      // Check if unit already has a device assigned
      const existingDevice = await knex('blulok_devices')
        .where('unit_id', unitId)
        .first();

      let oldDeviceId: string | null = null;
      if (existingDevice && existingDevice.id !== deviceId) {
        // Unassign the old device first
        oldDeviceId = existingDevice.id;
        await this.deviceModel.unassignDeviceFromUnit(existingDevice.id);
        
        // Emit unassignment event for old device
        this.eventService.emitDeviceUnassigned({
          deviceId: existingDevice.id,
          unitId,
          facilityId: unit.facility_id,
          metadata: {
            source: options.source || 'api',
            performedBy: options.performedBy,
            reason: 'reassigned'
          }
        });

        logger.info(`Unassigned device ${existingDevice.id} from unit ${unitId} due to reassignment`);
      }

      // Assign the device to the unit
      await this.deviceModel.assignDeviceToUnit(deviceId, unitId);

      // Emit assignment event
      this.eventService.emitDeviceAssigned({
        deviceId,
        unitId,
        facilityId: unit.facility_id,
        metadata: {
          source: options.source || 'api',
          performedBy: options.performedBy
        }
      });

      logger.info(`Device ${deviceId} assigned to unit ${unitId} by ${options.performedBy}`, {
        source: options.source || 'api',
        facilityId: unit.facility_id,
        oldDeviceId
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
    }
  ): Promise<void> {
    try {
      // Get device details
      const knex = DatabaseService.getInstance().connection;
      const foundDevice = await knex('blulok_devices')
        .where('id', deviceId)
        .first();
      
      if (!foundDevice) {
        throw new Error('Device not found');
      }

      // Check if device is assigned
      if (!foundDevice.unit_id) {
        logger.warn(`Device ${deviceId} is not assigned to any unit`);
        return;
      }

      const unitId = foundDevice.unit_id;
      const unit = await this.unitModel.findById(unitId);
      if (!unit) {
        // Unit was deleted, but device still has reference - still allow unassignment
        logger.warn(`Unit ${unitId} not found, but proceeding with device unassignment`);
      }

      // Get device's facility from gateway
      const gateway = await knex('gateways')
        .where('id', foundDevice.gateway_id)
        .first();
      
      const facilityId = gateway?.facility_id || unit?.facility_id;
      if (!facilityId) {
        throw new Error('Cannot determine facility for device');
      }

      // Unassign the device
      await this.deviceModel.unassignDeviceFromUnit(deviceId);

      // Emit unassignment event
      this.eventService.emitDeviceUnassigned({
        deviceId,
        unitId,
        facilityId,
        metadata: {
          source: options.source || 'api',
          performedBy: options.performedBy
        }
      });

      logger.info(`Device ${deviceId} unassigned from unit ${unitId} by ${options.performedBy}`, {
        source: options.source || 'api',
        facilityId
      });
    } catch (error) {
      logger.error('Error unassigning device from unit:', error);
      throw error;
    }
  }

  /**
   * Check if a user has access to manage a specific device
   */
  async hasUserAccessToDevice(deviceId: string, userId: string, userRole: UserRole): Promise<boolean> {
    try {
      // Admin and Dev Admin have access to all devices
      if (userRole === UserRole.ADMIN || userRole === UserRole.DEV_ADMIN) {
        return true;
      }

      // Facility Admin needs to verify device belongs to their facility
      if (userRole === UserRole.FACILITY_ADMIN) {
        const knex = DatabaseService.getInstance().connection;
        const foundDevice = await knex('blulok_devices')
          .where('id', deviceId)
          .first();
        
        if (!foundDevice) {
          return false;
        }

        // Get device's facility from gateway
        const gateway = await knex('gateways')
          .where('id', foundDevice.gateway_id)
          .first();
        
        if (!gateway) {
          return false;
        }

        // Check if user manages this facility
        const userFacilities = await knex('user_facility_associations')
          .where('user_id', userId)
          .where('facility_id', gateway.facility_id)
          .first();

        return !!userFacilities;
      }

      // Other roles don't have management access
      return false;
    } catch (error: any) {
      logger.error('Error checking user access to device:', error);
      return false;
    }
  }
}

