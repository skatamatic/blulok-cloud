/**
 * Access Control Service
 *
 * Service for querying facility access control devices (doors, gates, elevators).
 * Provides a clean interface for the mobile app to discover available access points
 * at a facility with proper RBAC enforcement.
 *
 * Key Features:
 * - Query access control devices by facility
 * - Filter by device type (door, gate, elevator)
 * - Include device status and lock state
 * - Facility-scoped access control
 *
 * Security Considerations:
 * - All queries are facility-scoped
 * - RBAC enforcement for device visibility
 * - Audit logging for device access queries
 */

import { DeviceModel, AccessControlDevice, DeviceFilters } from '@/models/device.model';
import { DeviceReachabilityEnrichmentService } from '@/services/device-reachability-enrichment.service';
import { AuthService } from '@/services/auth.service';
import { UserRole } from '@/types/auth.types';
import { AccessDeniedError, NotFoundError } from '@/middleware/error.middleware';
import { logger } from '@/utils/logger';

/**
 * Access Control Device Response
 * Formatted device data for API responses
 */
export interface AccessControlDeviceResponse {
  id: string;
  name: string;
  deviceType: 'door' | 'gate' | 'elevator';
  locationDescription: string | null;
  status: 'online' | 'offline' | 'error' | 'maintenance';
  isLocked: boolean;
  lastActivity: Date | null;
  facilityId: string;
  gatewayId: string;
}

/**
 * Facility Access Control Summary
 * Provides an overview of all access control devices at a facility
 */
export interface FacilityAccessControlSummary {
  facilityId: string;
  facilityName: string;
  devices: AccessControlDeviceResponse[];
  summary: {
    total: number;
    byType: {
      doors: number;
      gates: number;
      elevators: number;
    };
    byStatus: {
      online: number;
      offline: number;
      error: number;
      maintenance: number;
    };
  };
}

export class AccessControlService {
  private static instance: AccessControlService;
  private deviceModel: DeviceModel;

  private constructor() {
    this.deviceModel = new DeviceModel();
  }

  public static getInstance(): AccessControlService {
    if (!AccessControlService.instance) {
      AccessControlService.instance = new AccessControlService();
    }
    return AccessControlService.instance;
  }

  /**
   * Get all access control devices for a facility
   * 
   * @param facilityId - The facility to query
   * @param userId - The user making the request
   * @param userRole - The user's role
   * @param userFacilityIds - Facilities the user has access to
   * @param filters - Optional filters for device type, status, etc.
   * @returns Array of access control devices
   */
  async getAccessControlDevices(
    facilityId: string,
    userId: string,
    userRole: UserRole,
    userFacilityIds: string[] | undefined,
    filters: {
      deviceType?: 'door' | 'gate' | 'elevator';
      status?: 'online' | 'offline' | 'error' | 'maintenance';
      search?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ devices: AccessControlDeviceResponse[]; total: number }> {
    // Note: Facility access should already be validated by requireFacilityAccess middleware.
    // This check provides defense-in-depth for direct service calls.
    if (!this.canAccessFacility(userRole, facilityId, userFacilityIds)) {
      logger.warn(`Access denied: User ${userId} attempted to access facility ${facilityId} devices`);
      throw new AccessDeniedError('Access denied to this facility');
    }

    const deviceFilters: DeviceFilters = {
      facility_id: facilityId,
      access_control_type: filters.deviceType,
      status: filters.status,
      search: filters.search,
      sortBy: filters.sortBy as DeviceFilters['sortBy'],
      sortOrder: filters.sortOrder,
      limit: filters.limit,
      offset: filters.offset,
    };

    // Get devices from model - deviceType filter now applied at SQL level
    const [devices, total] = await Promise.all([
      this.deviceModel.findAccessControlDevices(deviceFilters),
      this.deviceModel.countAccessControlDevices(deviceFilters),
    ]);

    // Format response
    const formattedDevices = devices.map(device => this.formatDevice(device, facilityId));

    logger.info(`User ${userId} queried ${formattedDevices.length} access control devices for facility ${facilityId}`);

    return {
      devices: formattedDevices,
      total,
    };
  }

  /**
   * Get a summary of all access control devices at a facility
   */
  async getFacilityAccessControlSummary(
    facilityId: string,
    userId: string,
    userRole: UserRole,
    userFacilityIds: string[] | undefined
  ): Promise<FacilityAccessControlSummary> {
    // Note: Facility access should already be validated by requireFacilityAccess middleware.
    // This check provides defense-in-depth for direct service calls.
    if (!this.canAccessFacility(userRole, facilityId, userFacilityIds)) {
      logger.warn(`Access denied: User ${userId} attempted to access facility ${facilityId} summary`);
      throw new AccessDeniedError('Access denied to this facility');
    }

    // Get facility hierarchy which includes devices
    const hierarchy = await this.deviceModel.getFacilityDeviceHierarchy(facilityId);
    
    if (!hierarchy) {
      throw new NotFoundError('Facility');
    }

    const enriched = await DeviceReachabilityEnrichmentService.getInstance().enrichFacilityDeviceHierarchy(
      hierarchy,
    );
    const devices = enriched.accessControlDevices;
    const formattedDevices = devices.map((device) => this.formatDevice(device, facilityId));

    // Calculate summary statistics from effective status
    const summary = {
      total: devices.length,
      byType: {
        doors: devices.filter((d) => d.device_type === 'door').length,
        gates: devices.filter((d) => d.device_type === 'gate').length,
        elevators: devices.filter((d) => d.device_type === 'elevator').length,
      },
      byStatus: {
        online: devices.filter((d) => d.status === 'online').length,
        offline: devices.filter((d) => d.status === 'offline').length,
        error: devices.filter((d) => d.status === 'error').length,
        maintenance: devices.filter((d) => d.status === 'maintenance').length,
      },
    };

    logger.info(`User ${userId} queried access control summary for facility ${facilityId}: ${summary.total} devices`);

    return {
      facilityId,
      facilityName: hierarchy.facility?.name || 'Unknown',
      devices: formattedDevices,
      summary,
    };
  }

  /**
   * Get a single access control device by ID
   */
  async getAccessControlDeviceById(
    deviceId: string,
    userId: string,
    userRole: UserRole,
    userFacilityIds: string[] | undefined
  ): Promise<AccessControlDeviceResponse | null> {
    // Single query with JOIN to get device + facility info
    const device = await this.deviceModel.findAccessControlDeviceWithGateway(deviceId);
    
    if (!device || !device.facility_id) {
      return null;
    }

    // Check facility access
    if (!this.canAccessFacility(userRole, device.facility_id, userFacilityIds)) {
      logger.warn(`Access denied: User ${userId} attempted to access device ${deviceId}`);
      throw new AccessDeniedError('Access denied to this device');
    }

    return this.formatDevice(device, device.facility_id);
  }

  /**
   * Check if user can access a facility
   */
  private canAccessFacility(
    userRole: UserRole,
    facilityId: string,
    userFacilityIds: string[] | undefined
  ): boolean {
    // Global admins can access all facilities
    if (AuthService.canAccessAllFacilities(userRole)) {
      return true;
    }

    // Facility-scoped users must have the facility in their list
    if (!userFacilityIds || !userFacilityIds.includes(facilityId)) {
      return false;
    }

    return true;
  }

  /**
   * Format device for API response
   */
  private formatDevice(device: AccessControlDevice, facilityId: string): AccessControlDeviceResponse {
    return {
      id: device.id,
      name: device.name,
      deviceType: device.device_type,
      locationDescription: device.location_description || null,
      status: device.status,
      isLocked: device.is_locked,
      lastActivity: device.last_activity || null,
      facilityId,
      gatewayId: device.gateway_id,
    };
  }
}
